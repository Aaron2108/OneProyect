import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { decryptSecret, encryptSecret } from '../common/crypto.util';
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  fetchGoogleProfile,
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from '../common/google-oauth.util';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarStatusDto } from './google-calendar.types';

const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events';
// Margen antes de que expire el access token para forzar su refresco.
const EXPIRY_SKEW_MS = 60_000;

interface StatePayload {
  tenantId: string;
  userId: string;
}

/**
 * OAuth2 con Google Calendar y persistencia de la integración por tenant
 * (RF de Fase 3, ver docs/ROADMAP.md). Las primitivas de bajo nivel (canjear
 * código, refrescar token, leer perfil) viven en `common/google-oauth.util.ts`,
 * compartidas con el login/registro con Google (`auth/google-auth.service.ts`)
 * — son dos flujos independientes (distinto scope y ciclo de vida de tokens)
 * que hacen el mismo intercambio con Google.
 */
@Injectable()
export class GoogleCalendarOauthService {
  private readonly logger = new Logger(GoogleCalendarOauthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly encryptionKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.clientId = this.config.get<string>('google.clientId') ?? '';
    this.clientSecret = this.config.get<string>('google.clientSecret') ?? '';
    this.redirectUri = this.config.get<string>('google.redirectUri') ?? '';
    this.encryptionKey = this.config.get<string>('security.tokenEncryptionKey') ?? '';
  }

  /** Sin credenciales de Google (o sin clave de cifrado) la integración está deshabilitada. */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri && this.encryptionKey);
  }

  /** Token de estado firmado (JWT corto) para enlazar el callback de Google con el tenant/usuario que inició la conexión. */
  async signState(payload: StatePayload): Promise<string> {
    return this.jwt.signAsync(payload, { expiresIn: '600s' });
  }

  private async verifyState(state: string): Promise<StatePayload> {
    try {
      return await this.jwt.verifyAsync<StatePayload>(state);
    } catch {
      throw new BadRequestException('Estado de OAuth inválido o expirado');
    }
  }

  buildAuthUrl(state: string): string {
    return buildGoogleAuthUrl({
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scope: SCOPE,
      state,
    });
  }

  /** Procesa el `code` que Google devuelve al callback y guarda la integración cifrada. */
  async handleCallback(code: string, state: string): Promise<void> {
    const { tenantId, userId } = await this.verifyState(state);
    const tokens = await exchangeGoogleAuthCode({
      code,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri,
    });

    if (!tokens.refresh_token) {
      // Google solo devuelve refresh_token la primera vez que el usuario concede
      // acceso (o si se fuerza `prompt=consent`, que ya pedimos arriba). Sin él
      // no podemos renovar el access token pasadas ~1h — mejor fallar explícito
      // que guardar una integración que dejará de funcionar en silencio.
      throw new BadRequestException(
        'Google no devolvió un refresh_token; revoca el acceso previo en https://myaccount.google.com/permissions e inténtalo de nuevo',
      );
    }

    const profile = await fetchGoogleProfile(tokens.access_token);

    await this.prisma.googleCalendarIntegration.upsert({
      where: { tenantId },
      create: {
        tenantId,
        googleAccountEmail: profile.email,
        connectedByUserId: userId,
        accessToken: encryptSecret(tokens.access_token, this.encryptionKey),
        refreshToken: encryptSecret(tokens.refresh_token, this.encryptionKey),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        googleAccountEmail: profile.email,
        connectedByUserId: userId,
        accessToken: encryptSecret(tokens.access_token, this.encryptionKey),
        refreshToken: encryptSecret(tokens.refresh_token, this.encryptionKey),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        // Acabamos de hablar con Google con credenciales nuevas: el fallo
        // anterior deja de ser cierto y arrastrarlo dejaría la tarjeta en rojo
        // justo después de reconectar con éxito.
        lastCheckedAt: new Date(),
        lastCheckError: null,
      },
    });
    this.logger.log(`Google Calendar conectado para tenant ${tenantId} (${profile.email})`);
  }

  /** Devuelve un access token válido (lo refresca si está por expirar), o null si el tenant no tiene la integración conectada. */
  async getValidAccessToken(tenantId: string): Promise<string | null> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) {
      return null;
    }
    if (integration.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
      return decryptSecret(integration.accessToken, this.encryptionKey);
    }

    const refreshToken = decryptSecret(integration.refreshToken, this.encryptionKey);
    const tokens = await refreshGoogleAccessToken({
      refreshToken,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    await this.prisma.googleCalendarIntegration.update({
      where: { tenantId },
      data: {
        accessToken: encryptSecret(tokens.access_token, this.encryptionKey),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  }

  async getCalendarId(tenantId: string): Promise<string> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { tenantId },
      select: { googleCalendarId: true },
    });
    return integration?.googleCalendarId ?? 'primary';
  }

  async getStatus(tenantId: string): Promise<GoogleCalendarStatusDto> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) {
      return {
        connected: false,
        googleAccountEmail: null,
        connectedAt: null,
        needsReconnect: false,
        pendingSyncCount: 0,
        lastSyncError: null,
        lastCheckedAt: null,
        lastCheckError: null,
      };
    }

    // Los reintentos vivos son la señal de que algo va mal ahora mismo: sin
    // esto el fallo solo existía en el log del servidor, donde el dueño del
    // negocio no va a mirar nunca.
    const [pendingSyncCount, ultimo] = await Promise.all([
      this.prisma.googleCalendarSyncJob.count({ where: { tenantId } }),
      this.prisma.googleCalendarSyncJob.findFirst({
        where: { tenantId, lastError: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { lastError: true },
      }),
    ]);

    return {
      connected: true,
      googleAccountEmail: integration.googleAccountEmail,
      connectedAt: integration.createdAt.toISOString(),
      // Dos motivos para pedir reconexión, y hacen falta los dos: que las
      // credenciales guardadas no se puedan leer, y que la última comprobación
      // real contra Google fallara. Lo primero se detecta sin salir a la red;
      // lo segundo es el caso de un acceso revocado desde la cuenta de Google,
      // que aquí se vería perfecto mientras las citas no llegan a ningún sitio.
      needsReconnect:
        !this.credencialesUtilizables(integration.refreshToken) ||
        // Por contenido y no `!== null`: un campo ausente también significa
        // "sin error", y compararlo contra null pedía reconectar cuentas sanas.
        Boolean(integration.lastCheckError),
      pendingSyncCount,
      lastSyncError: ultimo?.lastError ?? null,
      lastCheckedAt: integration.lastCheckedAt?.toISOString() ?? null,
      lastCheckError: integration.lastCheckError,
    };
  }

  /**
   * Confirma contra Google que la conexión sigue sirviendo.
   *
   * Fuerza un refresco del access token AUNQUE el guardado no haya caducado: lo
   * que se quiere comprobar es el refresh token, que es la credencial de larga
   * duración y la única que puede haberse revocado sin que aquí se note. Usar
   * el access token en caché no probaría nada — es justo lo que ya hacía el
   * panel al decir "conectado".
   *
   * Después lee el calendario de destino: un token válido para una cuenta que
   * ya no tiene ese calendario tampoco sirve, y es mejor descubrirlo aquí que
   * en la primera cita que alguien agende.
   */
  async comprobarConexion(tenantId: string): Promise<{ ok: boolean; error: string | null }> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) {
      throw new BadRequestException('No hay ninguna cuenta de Google conectada');
    }

    let error: string | null = null;
    try {
      const refreshToken = decryptSecret(integration.refreshToken, this.encryptionKey);
      const tokens = await refreshGoogleAccessToken({
        refreshToken,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });
      await this.verificarCalendario(tokens.access_token, integration.googleCalendarId);

      // El access token recién emitido se guarda: la comprobación deja la
      // integración lista para trabajar, no solo diagnosticada.
      await this.prisma.googleCalendarIntegration.update({
        where: { tenantId },
        data: {
          accessToken: encryptSecret(tokens.access_token, this.encryptionKey),
          accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          lastCheckedAt: new Date(),
          lastCheckError: null,
        },
      });
      this.logger.log(`Conexión con Google Calendar comprobada (tenant ${tenantId})`);
      return { ok: true, error: null };
    } catch (err) {
      error = this.mensajeLegible(err as Error);
      await this.prisma.googleCalendarIntegration.update({
        where: { tenantId },
        data: { lastCheckedAt: new Date(), lastCheckError: error },
      });
      this.logger.warn(`La conexión con Google Calendar no responde (tenant ${tenantId}): ${error}`);
      return { ok: false, error };
    }
  }

  /** Lee el calendario de destino para confirmar que existe y es accesible. */
  private async verificarCalendario(accessToken: string, calendarId: string): Promise<void> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Google respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
    }
  }

  /**
   * Traduce el fallo a algo que el dueño del negocio pueda accionar.
   *
   * El mensaje crudo de Google es `invalid_grant`, que no le dice nada a nadie
   * y encima suena a problema del programa cuando normalmente es que alguien
   * retiró el permiso desde su cuenta.
   */
  private mensajeLegible(err: Error): string {
    const crudo = err.message ?? '';
    if (/invalid_grant|unauthorized_client|401/i.test(crudo)) {
      return 'Google ya no acepta el permiso guardado. Suele pasar al retirar el acceso a WhatsFlow desde la cuenta de Google, o al cambiar la contraseña.';
    }
    if (/403/.test(crudo)) {
      return 'La cuenta conectada no tiene permiso sobre ese calendario.';
    }
    if (/404/.test(crudo)) {
      return 'El calendario conectado ya no existe en esa cuenta.';
    }
    return crudo.slice(0, 300);
  }

  /**
   * ¿El refresh token guardado se puede seguir usando?
   *
   * Solo se comprueba que descifre, sin llamar a Google: el panel consulta el
   * estado en cada visita al calendario y una petición de red por visita sería
   * caro para lo que aporta. Descifrar detecta el caso que de verdad rompe la
   * integración sin previo aviso — que TOKEN_ENCRYPTION_KEY haya cambiado desde
   * que se conectó la cuenta, con lo que los tokens quedan ilegibles para
   * siempre. Un token revocado desde Google no se ve aquí; ese se descubre al
   * sincronizar y aflora por `lastSyncError`.
   */
  private credencialesUtilizables(refreshTokenCifrado: string): boolean {
    try {
      return decryptSecret(refreshTokenCifrado, this.encryptionKey).length > 0;
    } catch {
      return false;
    }
  }

  async disconnect(tenantId: string): Promise<void> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) {
      return;
    }
    try {
      const accessToken = decryptSecret(integration.accessToken, this.encryptionKey);
      await revokeGoogleToken(accessToken);
    } catch (err) {
      // Revocar es best-effort: si Google no responde igual borramos las
      // credenciales locales, que es lo que le pertenece a WhatsFlow controlar.
      this.logger.warn(`No se pudo revocar el token en Google: ${(err as Error).message}`);
    }
    await this.prisma.googleCalendarIntegration.delete({ where: { tenantId } });
  }
}
