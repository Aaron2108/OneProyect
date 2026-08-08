import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappConnectionStatus, WhatsappInstance } from '@prisma/client';
import { randomBytes } from 'crypto';
import { assertTenantId } from '../common/tenant.util';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChannelStatusDto } from './dto/channel-status.dto';
import {
  WHATSAPP_PROVIDER,
  WhatsAppProvider,
} from './providers/whatsapp-provider.interface';

/**
 * Cuánto damos por bueno un QR antes de pedir otro.
 *
 * WhatsApp los caduca en torno al minuto. Se usa un margen por debajo para que
 * el panel nunca llegue a enseñar uno muerto: un QR que no escanea es
 * indistinguible, para quien lo mira, de una integración rota.
 */
const QR_VIGENCIA_MS = 50_000;

/**
 * El vínculo del negocio con WhatsApp: alta, estado, reconexión y baja.
 *
 * Habla con el proveedor SIEMPRE a través de `WhatsAppProvider`. Aquí no hay una
 * sola mención a Evolution, y ese es el punto: el día que el proveedor activo
 * sea Meta, este archivo no cambia.
 */
@Injectable()
export class WhatsappInstanceService {
  private readonly logger = new Logger(WhatsappInstanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /**
   * Estado del canal para el panel.
   *
   * Además de leer la BD, reconcilia con el proveedor mientras hay una
   * vinculación en curso: pregunta si ya se escaneó y renueva el QR caducado.
   * Esto es lo que hace que la conexión se detecte sola incluso cuando los
   * webhooks no llegan —el caso normal en desarrollo, donde Evolution no puede
   * alcanzar `localhost`—. Sin ello, el usuario escanearía el QR y el panel se
   * quedaría en "Esperando escaneo" para siempre.
   */
  async obtenerEstado(tenantId: string): Promise<ChannelStatusDto> {
    assertTenantId(tenantId);
    let instancia = await this.prisma.whatsappInstance.findUnique({ where: { tenantId } });

    if (instancia?.status === WhatsappConnectionStatus.QR_PENDING) {
      instancia = await this.reconciliarVinculacion(instancia);
    }

    return this.aDto(instancia);
  }

  /** Resuelve la instancia dueña de un identificador del proveedor. */
  buscarPorExternalId(externalId: string): Promise<WhatsappInstance | null> {
    return this.prisma.whatsappInstance.findUnique({ where: { externalId } });
  }

  /** El canal de un negocio, o null si nunca se configuró. */
  buscarPorTenant(tenantId: string): Promise<WhatsappInstance | null> {
    return this.prisma.whatsappInstance.findUnique({ where: { tenantId } });
  }

  /** La credencial de la instancia, descifrada. */
  credencialDe(instancia: WhatsappInstance): string | null {
    return this.pii.decryptNullable(instancia.credential);
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  /**
   * Da de alta una sesión y devuelve el QR.
   *
   * Si ya había una, se elimina antes en el proveedor: dejar sesiones huérfanas
   * consume recursos del servidor de WhatsApp y, con Baileys, una sesión vieja
   * puede seguir recibiendo mensajes que ya no llegarían a ninguna bandeja.
   */
  async conectar(tenantId: string): Promise<ChannelStatusDto> {
    assertTenantId(tenantId);
    const previa = await this.prisma.whatsappInstance.findUnique({ where: { tenantId } });
    if (previa) {
      await this.eliminarEnProveedor(previa);
    }

    // Identificador nuevo en cada alta, con sufijo aleatorio: si el borrado de
    // la sesión anterior falló, reutilizar el nombre chocaría con ella y el
    // usuario vería un error en vez de un QR.
    const externalId = `wf-${tenantId}-${randomBytes(3).toString('hex')}`;

    const sesion = await this.provider.crearSesion({
      externalId,
      webhookUrl: this.urlDelWebhook(),
      webhookHeaders: this.cabecerasDelWebhook(),
    });

    const instancia = await this.prisma.whatsappInstance.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: this.provider.tipo,
        externalId,
        status: WhatsappConnectionStatus.QR_PENDING,
        credential: this.pii.encryptNullable(sesion.credential),
        qrCode: sesion.codigoVinculacion,
        qrExpiresAt: sesion.codigoVinculacion ? new Date(Date.now() + QR_VIGENCIA_MS) : null,
        lastError: null,
      },
      update: {
        provider: this.provider.tipo,
        externalId,
        status: WhatsappConnectionStatus.QR_PENDING,
        credential: this.pii.encryptNullable(sesion.credential),
        qrCode: sesion.codigoVinculacion,
        qrExpiresAt: sesion.codigoVinculacion ? new Date(Date.now() + QR_VIGENCIA_MS) : null,
        phoneNumber: null,
        connectedAt: null,
        lastError: null,
        lastStatusAt: new Date(),
      },
    });

    this.logger.log(`Sesión de WhatsApp creada para el tenant ${tenantId}`);
    this.avisarDelCanal(tenantId, instancia.status);
    return this.aDto(instancia);
  }

  /**
   * Vuelve a vincular. Con una sesión ya creada basta con pedir otro QR; sin
   * ella (o si el proveedor ya no la conoce) se empieza de cero.
   */
  async reconectar(tenantId: string): Promise<ChannelStatusDto> {
    assertTenantId(tenantId);
    const instancia = await this.prisma.whatsappInstance.findUnique({ where: { tenantId } });
    if (!instancia) {
      return this.conectar(tenantId);
    }

    try {
      const codigo = await this.provider.renovarVinculacion({
        externalId: instancia.externalId,
        credential: this.credencialDe(instancia),
      });
      if (!codigo) {
        // El proveedor no devolvió código: o la sesión ya no existe, o sigue
        // conectada. Crear una nueva resuelve el primer caso y es inocuo en el
        // segundo, que es el que el usuario está pidiendo rehacer.
        return this.conectar(tenantId);
      }
      const actualizada = await this.prisma.whatsappInstance.update({
        where: { tenantId },
        data: {
          status: WhatsappConnectionStatus.QR_PENDING,
          qrCode: codigo,
          qrExpiresAt: new Date(Date.now() + QR_VIGENCIA_MS),
          lastError: null,
          lastStatusAt: new Date(),
        },
      });
      this.avisarDelCanal(tenantId, actualizada.status);
      return this.aDto(actualizada);
    } catch (err) {
      this.logger.warn(`Renovar la vinculación falló, se crea una sesión nueva: ${(err as Error).message}`);
      return this.conectar(tenantId);
    }
  }

  /**
   * Desvincula el número.
   *
   * La fila se conserva en DISCONNECTED en vez de borrarse: el panel tiene que
   * poder decir "desconectado" y no "nunca configurado", que no es lo mismo
   * para quien está intentando entender por qué no le entran mensajes.
   */
  async desconectar(tenantId: string): Promise<ChannelStatusDto> {
    assertTenantId(tenantId);
    const instancia = await this.prisma.whatsappInstance.findUnique({ where: { tenantId } });
    if (!instancia) {
      return this.aDto(null);
    }
    await this.eliminarEnProveedor(instancia);

    const actualizada = await this.prisma.whatsappInstance.update({
      where: { tenantId },
      data: {
        status: WhatsappConnectionStatus.DISCONNECTED,
        // La credencial se borra: sin sesión no autoriza nada, y guardar un
        // secreto que ya no sirve solo añade superficie de filtración.
        credential: null,
        qrCode: null,
        qrExpiresAt: null,
        connectedAt: null,
        lastError: null,
        lastStatusAt: new Date(),
      },
    });
    this.logger.log(`Canal de WhatsApp desconectado (tenant ${tenantId})`);
    this.avisarDelCanal(tenantId, actualizada.status);
    return this.aDto(actualizada);
  }

  // -------------------------------------------------------------------------
  // Eventos del proveedor
  // -------------------------------------------------------------------------

  /** El proveedor avisa de que la sesión subió o cayó. */
  async aplicarEstado(
    instancia: WhatsappInstance,
    conectado: boolean,
    phoneNumber: string | null,
    motivo: string | null,
  ): Promise<void> {
    const status = conectado
      ? WhatsappConnectionStatus.CONNECTED
      : WhatsappConnectionStatus.DISCONNECTED;
    if (instancia.status === status && !phoneNumber) return;

    await this.prisma.whatsappInstance.update({
      where: { id: instancia.id },
      data: {
        status,
        // Al conectar se borra el QR: ya se usó, y un código de vinculación
        // guardado de más es una credencial viva sin motivo.
        qrCode: conectado ? null : instancia.qrCode,
        qrExpiresAt: conectado ? null : instancia.qrExpiresAt,
        phoneNumber: phoneNumber ?? instancia.phoneNumber,
        connectedAt: conectado ? (instancia.connectedAt ?? new Date()) : null,
        lastError: conectado ? null : motivo,
        lastStatusAt: new Date(),
      },
    });
    this.logger.log(
      `Canal ${conectado ? 'conectado' : 'desconectado'} (tenant ${instancia.tenantId})`,
    );
    this.avisarDelCanal(instancia.tenantId, status);
  }

  /** El proveedor emitió un código de vinculación nuevo (el anterior caducó). */
  async aplicarVinculacion(instancia: WhatsappInstance, codigo: string): Promise<void> {
    await this.prisma.whatsappInstance.update({
      where: { id: instancia.id },
      data: {
        status: WhatsappConnectionStatus.QR_PENDING,
        qrCode: codigo,
        qrExpiresAt: new Date(Date.now() + QR_VIGENCIA_MS),
        lastStatusAt: new Date(),
      },
    });
    this.avisarDelCanal(instancia.tenantId, WhatsappConnectionStatus.QR_PENDING);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Pregunta al proveedor si la vinculación ya se completó y, si no, refresca el
   * QR caducado. Los fallos no propagan: que el proveedor no conteste no debe
   * dejar sin pantalla de "Canales" a quien solo quería mirar el estado.
   */
  private async reconciliarVinculacion(instancia: WhatsappInstance): Promise<WhatsappInstance> {
    const sesion = {
      externalId: instancia.externalId,
      credential: this.credencialDe(instancia),
    };

    try {
      const estado = await this.provider.consultarEstado(sesion);
      if (estado.conectado) {
        await this.aplicarEstado(instancia, true, estado.phoneNumber, null);
        return (
          (await this.prisma.whatsappInstance.findUnique({ where: { id: instancia.id } })) ??
          instancia
        );
      }

      const vigente = instancia.qrExpiresAt !== null && instancia.qrExpiresAt > new Date();
      if (vigente) return instancia;

      const codigo = await this.provider.renovarVinculacion(sesion);
      if (!codigo) return instancia;
      await this.aplicarVinculacion(instancia, codigo);
      return (
        (await this.prisma.whatsappInstance.findUnique({ where: { id: instancia.id } })) ??
        instancia
      );
    } catch (err) {
      this.logger.warn(`No se pudo reconciliar la vinculación: ${(err as Error).message}`);
      return instancia;
    }
  }

  /** Borra la sesión en el proveedor sin dejar que un fallo bloquee la baja. */
  private async eliminarEnProveedor(instancia: WhatsappInstance): Promise<void> {
    try {
      await this.provider.eliminarSesion({
        externalId: instancia.externalId,
        credential: this.credencialDe(instancia),
      });
    } catch (err) {
      this.logger.warn(`No se pudo eliminar la sesión anterior: ${(err as Error).message}`);
    }
  }

  private urlDelWebhook(): string {
    const base = (this.config.get<string>('evolution.publicUrl') ?? '').replace(/\/$/, '');
    return `${base}/webhooks/whatsapp/evolution`;
  }

  private cabecerasDelWebhook(): Record<string, string> {
    const token = this.config.get<string>('evolution.webhookToken') ?? '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private avisarDelCanal(tenantId: string, status: WhatsappConnectionStatus): void {
    this.realtime.emitirATenant(tenantId, { tipo: 'canal', status });
  }

  private aDto(instancia: WhatsappInstance | null): ChannelStatusDto {
    const qrVigente =
      instancia?.status === WhatsappConnectionStatus.QR_PENDING ? instancia.qrCode : null;
    return {
      configurado: this.provider.estaConfigurado(),
      vinculaConQr: this.provider.vinculaConQr,
      provider: instancia?.provider ?? this.provider.tipo,
      status: instancia?.status ?? WhatsappConnectionStatus.DISCONNECTED,
      phoneNumber: instancia?.phoneNumber ?? null,
      qrCode: qrVigente,
      qrExpiresAt: instancia?.qrExpiresAt?.toISOString() ?? null,
      lastError: instancia?.lastError ?? null,
      connectedAt: instancia?.connectedAt?.toISOString() ?? null,
    };
  }
}
