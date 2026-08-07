import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EventoWhatsApp } from './providers/whatsapp-provider.interface';
import { PROCESS_INBOUND_MESSAGE, WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { WhatsappInstanceService } from './whatsapp-instance.service';
import { InboundMessageJob } from './whatsapp.types';

/**
 * La puerta por la que entran los eventos ya traducidos, venga el webhook de
 * donde venga.
 *
 * Aquí no hay nada específico de ningún proveedor: eso ya lo resolvió
 * `WhatsAppProvider.interpretarWebhook`. Lo único que se hace es resolver a qué
 * negocio pertenece cada evento y repartirlo — los mensajes a la cola, los
 * cambios de sesión al servicio de instancias.
 *
 * Los mensajes NO se procesan aquí: el webhook tiene que contestar rápido o el
 * proveedor lo reintenta y acaba desactivándolo (ARCHITECTURE.md §2). Persistir,
 * cifrar y responder con IA puede tardar segundos; encolar tarda uno o dos
 * milisegundos.
 */
@Injectable()
export class WhatsappIngestService {
  private readonly logger = new Logger(WhatsappIngestService.name);

  constructor(
    private readonly instancias: WhatsappInstanceService,
    @InjectQueue(WHATSAPP_INBOUND_QUEUE) private readonly cola: Queue,
  ) {}

  /** Reparte los eventos. Devuelve cuántos mensajes se encolaron. */
  async ingerir(eventos: EventoWhatsApp[]): Promise<number> {
    let encolados = 0;

    for (const evento of eventos) {
      // El tenant sale SIEMPRE de la instancia registrada en BD, nunca de un
      // campo del payload: quien alcance la ruta del webhook no puede elegir en
      // la bandeja de qué negocio quiere escribir.
      const instancia = await this.instancias.buscarPorExternalId(evento.externalId);
      if (!instancia) {
        this.logger.warn(`Evento de una sesión desconocida (${evento.externalId}); se ignora`);
        continue;
      }

      switch (evento.clase) {
        case 'mensaje': {
          const job: InboundMessageJob = {
            tenantId: instancia.tenantId,
            externalId: evento.externalId,
            externalMessageId: evento.externalMessageId,
            direccion: evento.direccion,
            contactPhone: evento.contactPhone,
            contactName: evento.contactName,
            tipo: evento.tipo,
            texto: evento.texto,
            enviadoEn: evento.enviadoEn.toISOString(),
          };
          await this.cola.add(PROCESS_INBOUND_MESSAGE, job, {
            // El id del mensaje en el proveedor como jobId: BullMQ descarta el
            // duplicado por su cuenta cuando el proveedor reenvía el mismo
            // evento (lo hace ante cualquier respuesta que no sea 2xx).
            // BullMQ no admite ":" en el jobId, de ahí el "_".
            jobId: `${evento.externalId}_${evento.externalMessageId}`,
            removeOnComplete: true,
            removeOnFail: 100,
          });
          encolados++;
          break;
        }

        case 'estado-sesion':
          await this.instancias.aplicarEstado(
            instancia,
            evento.conectado,
            evento.phoneNumber,
            evento.motivo,
          );
          break;

        case 'vinculacion':
          await this.instancias.aplicarVinculacion(instancia, evento.codigoVinculacion);
          break;
      }
    }

    if (encolados > 0) {
      this.logger.log(`Encolados ${encolados} mensaje(s) de WhatsApp`);
    }
    return encolados;
  }
}
