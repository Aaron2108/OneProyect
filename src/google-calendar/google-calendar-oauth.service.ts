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
      return { connected: false, googleAccountEmail: null, connectedAt: null };
    }
    return {
      connected: true,
      googleAccountEmail: integration.googleAccountEmail,
      connectedAt: integration.createdAt.toISOString(),
    };
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
