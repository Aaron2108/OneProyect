import { BadRequestException, Injectable } from '@nestjs/common';
import { WhatsappProviderKind } from '@prisma/client';
import { WhatsAppWebhookBody } from '../whatsapp.types';
import { WhatsappSenderService } from '../whatsapp-sender.service';
import {
  CrearSesionParams,
  EnviarTextoParams,
  EstadoRemoto,
  EventoMensaje,
  EventoWhatsApp,
  ResultadoEnvio,
  SesionCreada,
  SesionParams,
  WhatsAppProvider,
} from './whatsapp-provider.interface';

/**
 * La Cloud API oficial de Meta detrás de la misma interfaz.
 *
 * Existe hoy, con Evolution activo, por un motivo concreto: una abstracción con
 * una sola implementación no está probada, está supuesta. Tener las dos obliga a
 * que la interfaz sea de verdad neutral —y ya sacó a la luz que la vinculación
 * por QR no es universal, de ahí `vinculaConQr`—. El día de la migración esto
 * pasa a ser el proveedor activo cambiando `WHATSAPP_PROVIDER`, sin tocar la
 * bandeja, el worker ni el panel.
 *
 * Lo que no cubre: el alta de un número. En Meta no se vincula escaneando nada;
 * el número se aprovisiona en el Business Manager y se autoriza con el
 * *embedded signup*, que es trabajo aparte y no se finge aquí.
 */
@Injectable()
export class MetaProvider implements WhatsAppProvider {
  readonly tipo = WhatsappProviderKind.META;
  readonly vinculaConQr = false;

  constructor(private readonly sender: WhatsappSenderService) {}

  estaConfigurado(): boolean {
    return this.sender.isEnabled();
  }

  crearSesion(_params: CrearSesionParams): Promise<SesionCreada> {
    return Promise.reject(
      new BadRequestException(
        'Con la API oficial de Meta el número se da de alta en el Business Manager, no desde el panel',
      ),
    );
  }

  /** No hay nada que renovar: la autorización de Meta no caduca en segundos. */
  renovarVinculacion(_params: SesionParams): Promise<string | null> {
    return Promise.resolve(null);
  }

  /**
   * Un número aprovisionado en Meta está siempre disponible: no hay sesión que
   * se caiga como en Baileys. Si hay credenciales, el canal opera.
   */
  consultarEstado(_params: SesionParams): Promise<EstadoRemoto> {
    return Promise.resolve({
      conectado: this.estaConfigurado(),
      // El identificador de sesión ES el `phone_number_id`, que no es el número
      // en sí; el número visible se resuelve al recibir el primer evento.
      phoneNumber: null,
    });
  }

  /** Desvincular un número oficial se hace en Meta, no borrando nada aquí. */
  eliminarSesion(_params: SesionParams): Promise<void> {
    return Promise.resolve();
  }

  async enviarTexto(params: EnviarTextoParams): Promise<ResultadoEnvio> {
    const { messageId } = await this.sender.sendText({
      phoneNumberId: params.externalId,
      to: params.to,
      text: params.text,
    });
    return { externalMessageId: messageId };
  }

  /**
   * Traduce el webhook de Meta a los mismos eventos que produce Evolution.
   *
   * La firma HMAC no se comprueba aquí sino en el controlador del webhook: es
   * autenticación del transporte, y cada proveedor la resuelve a su manera
   * (Meta firma el cuerpo; Evolution manda una cabecera compartida).
   */
  interpretarWebhook(cuerpo: unknown): EventoWhatsApp[] {
    if (!cuerpo || typeof cuerpo !== 'object') return [];
    const body = cuerpo as WhatsAppWebhookBody;
    const eventos: EventoMensaje[] = [];

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const externalId = value?.metadata?.phone_number_id;
        if (!externalId) continue;

        const contactName = value.contacts?.[0]?.profile?.name ?? null;
        for (const mensaje of value.messages ?? []) {
          const texto = mensaje.text?.body ?? '';
          if (texto.trim().length === 0) continue;
          eventos.push({
            clase: 'mensaje',
            externalId,
            externalMessageId: mensaje.id,
            // El webhook de Meta solo entrega mensajes del cliente; lo que sale
            // del negocio llega como `statuses`, que el MVP no consume.
            direccion: 'entrante',
            contactPhone: mensaje.from,
            contactName,
            tipo: mensaje.type,
            texto,
            enviadoEn: this.aFecha(mensaje.timestamp),
          });
        }
      }
    }
    return eventos;
  }

  /** El timestamp de Meta viene en segundos epoch, como texto. */
  private aFecha(timestamp: string): Date {
    const segundos = Number(timestamp);
    return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date();
  }
}
