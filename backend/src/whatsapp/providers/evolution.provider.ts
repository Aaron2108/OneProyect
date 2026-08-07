import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappProviderKind } from '@prisma/client';
import {
  EvolutionConnectResponse,
  EvolutionCreateResponse,
  EvolutionSendResponse,
  EvolutionStateResponse,
} from './evolution.types';
import { interpretarWebhookEvolution } from './evolution-webhook.util';
import {
  CrearSesionParams,
  EnviarTextoParams,
  EstadoRemoto,
  EventoWhatsApp,
  ResultadoEnvio,
  SesionCreada,
  SesionParams,
  WhatsAppProvider,
} from './whatsapp-provider.interface';

/** Eventos a los que se suscribe la instancia. Ver `Events` en wa.types.ts. */
const EVENTOS_SUSCRITOS = [
  'MESSAGES_UPSERT', // mensajes entrantes
  'SEND_MESSAGE', // mensajes que salen (incluidos los del móvil del dueño)
  'CONNECTION_UPDATE', // vínculo arriba/abajo
  'QRCODE_UPDATED', // el QR caducó y hay uno nuevo
  'LOGOUT_INSTANCE', // la sesión se cerró desde el teléfono
];

/** Baileys: el motor de WhatsApp que usa Evolution para vincular por QR. */
const INTEGRACION = 'WHATSAPP-BAILEYS';

/** Un proveedor colgado no puede bloquear el hilo del panel indefinidamente. */
const TIMEOUT_MS = 20_000;

/**
 * Todo el trato con Evolution API, y en ningún otro sitio.
 *
 * Es el puente del MVP hasta la Cloud API oficial: Evolution levanta una sesión
 * de WhatsApp por negocio contra un WhatsApp normal, vinculada escaneando un QR
 * como WhatsApp Web. Eso permite arrancar sin esperar la verificación de Meta,
 * a cambio de una sesión que se puede caer y que hay que revincular — de ahí que
 * el panel tenga estado, reconexión y desconexión explícitas.
 *
 * Referencia: https://github.com/evolution-foundation/evolution-api (v2)
 */
@Injectable()
export class EvolutionProvider implements WhatsAppProvider {
  readonly tipo = WhatsappProviderKind.EVOLUTION;
  readonly vinculaConQr = true;

  private readonly logger = new Logger(EvolutionProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('evolution.baseUrl') ?? '').replace(/\/$/, '');
    this.apiKey = config.get<string>('evolution.apiKey') ?? '';
  }

  estaConfigurado(): boolean {
    return this.baseUrl.length > 0 && this.apiKey.length > 0;
  }

  /**
   * Crea la instancia con el webhook ya configurado en la misma llamada.
   *
   * Se hace en un solo paso a propósito: si el webhook se registrara después,
   * existiría una ventana en la que la instancia ya está viva y sus eventos —
   * incluido el `connection.update` que confirma el escaneo — se pierden.
   */
  async crearSesion(params: CrearSesionParams): Promise<SesionCreada> {
    const respuesta = await this.pedir<EvolutionCreateResponse>('POST', '/instance/create', {
      cuerpo: {
        instanceName: params.externalId,
        integration: INTEGRACION,
        qrcode: true,
        webhook: {
          enabled: true,
          url: params.webhookUrl,
          headers: params.webhookHeaders,
          // Una sola URL para todos los eventos: con `byEvents` Evolution añade
          // el nombre del evento a la ruta y habría que exponer una por evento.
          byEvents: false,
          base64: false,
          events: EVENTOS_SUSCRITOS,
        },
      },
    });

    // El token de la instancia llega como texto o como `{ apikey }` según versión.
    const hash = respuesta.hash;
    const credential = typeof hash === 'string' ? hash : (hash?.apikey ?? null);

    return {
      codigoVinculacion: respuesta.qrcode?.base64 ?? null,
      credential: credential && credential.length > 0 ? credential : null,
    };
  }

  /**
   * Pide un QR nuevo. El QR de WhatsApp caduca en menos de un minuto, así que
   * esto se llama tanto al reconectar como cada vez que el panel se queda sin
   * código vigente mientras el usuario busca el teléfono.
   */
  async renovarVinculacion(params: SesionParams): Promise<string | null> {
    const respuesta = await this.pedir<EvolutionConnectResponse>(
      'GET',
      `/instance/connect/${encodeURIComponent(params.externalId)}`,
      { credential: params.credential },
    );
    return respuesta.base64 ?? null;
  }

  async consultarEstado(params: SesionParams): Promise<EstadoRemoto> {
    const respuesta = await this.pedir<EvolutionStateResponse>(
      'GET',
      `/instance/connectionState/${encodeURIComponent(params.externalId)}`,
      { credential: params.credential },
    );
    const estado = (respuesta.instance?.state ?? '').toLowerCase();
    return {
      conectado: estado === 'open',
      phoneNumber: this.telefonoDeOwner(respuesta.instance?.owner),
    };
  }

  /**
   * Cierra la sesión y borra la instancia. Se hace en dos pasos porque `logout`
   * suelta el teléfono pero deja la instancia registrada; sin el `delete`, el
   * nombre queda ocupado y una reconexión posterior chocaría con él.
   *
   * Ninguno de los dos pasos aborta el otro: desconectar tiene que terminar
   * aunque el proveedor ya no sepa nada de esta sesión (que es, precisamente,
   * el estado al que se quiere llegar).
   */
  async eliminarSesion(params: SesionParams): Promise<void> {
    const ruta = encodeURIComponent(params.externalId);
    for (const [metodo, camino] of [
      ['DELETE', `/instance/logout/${ruta}`],
      ['DELETE', `/instance/delete/${ruta}`],
    ] as const) {
      try {
        await this.pedir(metodo, camino, { credential: params.credential });
      } catch (err) {
        this.logger.warn(`${camino} falló: ${(err as Error).message}`);
      }
    }
  }

  async enviarTexto(params: EnviarTextoParams): Promise<ResultadoEnvio> {
    const respuesta = await this.pedir<EvolutionSendResponse>(
      'POST',
      `/message/sendText/${encodeURIComponent(params.externalId)}`,
      {
        credential: params.credential,
        cuerpo: { number: params.to, text: params.text },
      },
    );
    return { externalMessageId: respuesta.key?.id ?? null };
  }

  interpretarWebhook(cuerpo: unknown): EventoWhatsApp[] {
    return interpretarWebhookEvolution(cuerpo);
  }

  /**
   * Una sola puerta de salida hacia Evolution: cabeceras, timeout y traducción
   * de errores en un sitio. Que el resto de métodos no toque `fetch` es lo que
   * hace realista sustituir este archivo entero por `MetaProvider`.
   */
  private async pedir<T>(
    metodo: 'GET' | 'POST' | 'DELETE',
    camino: string,
    opciones: { cuerpo?: unknown; credential?: string | null } = {},
  ): Promise<T> {
    if (!this.estaConfigurado()) {
      throw new ServiceUnavailableException(
        'El canal de WhatsApp no está configurado en el servidor',
      );
    }

    // La clave de la instancia autoriza solo sobre ella; la global vale para
    // todo. Se prefiere la primera para que un token filtrado no dé acceso a
    // las sesiones de los demás negocios.
    const apikey = opciones.credential || this.apiKey;

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.baseUrl}${camino}`, {
        method: metodo,
        headers: { apikey, 'Content-Type': 'application/json' },
        body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Servidor caído o timeout: es un fallo de infraestructura, no del usuario.
      throw new ServiceUnavailableException(
        `No se pudo contactar con el servicio de WhatsApp: ${(err as Error).message}`,
      );
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new ServiceUnavailableException(
        `El servicio de WhatsApp respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
      );
    }

    // `logout`/`delete` pueden responder sin cuerpo.
    const texto = await respuesta.text();
    if (texto.trim().length === 0) return {} as T;
    try {
      return JSON.parse(texto) as T;
    } catch {
      return {} as T;
    }
  }

  /** El `owner` de Evolution es un JID ("51987654321@s.whatsapp.net"). */
  private telefonoDeOwner(owner: string | undefined): string | null {
    if (!owner) return null;
    const digitos = (owner.split('@')[0] ?? '').split(':')[0]?.replace(/\D/g, '') ?? '';
    return digitos.length > 0 ? digitos : null;
  }
}
