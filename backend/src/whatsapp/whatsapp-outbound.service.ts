import { Inject, Injectable, Logger } from '@nestjs/common';
import { WhatsappConnectionStatus, WhatsappProviderKind } from '@prisma/client';
import {
  WHATSAPP_PROVIDER,
  WhatsAppProvider,
} from './providers/whatsapp-provider.interface';
import { WhatsappInstanceService } from './whatsapp-instance.service';
import { isWithinServiceWindow } from './whatsapp-window.util';

/** Por qué no salió un mensaje. Null = salió. */
export type MotivoNoEnviado =
  | 'canal-desconectado'
  | 'ventana-cerrada'
  | 'error-proveedor';

export interface ResultadoEnvioSaliente {
  enviado: boolean;
  externalMessageId: string | null;
  motivo: MotivoNoEnviado | null;
}

/**
 * La única salida de mensajes hacia el cliente final.
 *
 * Tanto la respuesta de la IA como la que escribe una persona en la bandeja
 * pasan por aquí, y ninguna de las dos sabe qué proveedor hay debajo. Concentrar
 * el envío en un sitio también concentra las reglas de cuándo NO se puede
 * enviar, que antes estaban duplicadas en el worker y en el servicio de
 * conversaciones.
 *
 * Nunca lanza: un envío fallido no debe tumbar la operación que lo originó. El
 * mensaje ya quedó guardado y visible en la bandeja; lo que se pierde es la
 * entrega, y eso se informa en el resultado.
 */
@Injectable()
export class WhatsappOutboundService {
  private readonly logger = new Logger(WhatsappOutboundService.name);

  constructor(
    private readonly instancias: WhatsappInstanceService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  async enviarTexto(params: {
    tenantId: string;
    to: string;
    text: string;
    /** Último mensaje del cliente: define la ventana de servicio de Meta. */
    lastInboundAt: Date | null;
  }): Promise<ResultadoEnvioSaliente> {
    const instancia = await this.instancias.buscarPorTenant(params.tenantId);

    if (!instancia || instancia.status !== WhatsappConnectionStatus.CONNECTED) {
      // Sin canal vinculado no hay a dónde enviar. Pasa en local (nadie escaneó
      // ningún QR) y cuando la sesión se cae: en ambos casos el mensaje se queda
      // guardado, que es lo que permite seguir trabajando con datos de prueba.
      this.logger.warn(`Canal no conectado (tenant ${params.tenantId}); mensaje no enviado`);
      return { enviado: false, externalMessageId: null, motivo: 'canal-desconectado' };
    }

    // RF-10: fuera de las 24h desde el último mensaje del cliente, Meta solo
    // deja enviar plantillas pre-aprobadas (diferido). Es una regla DE META, no
    // de WhatsApp: Evolution habla con un WhatsApp normal y no la tiene, así que
    // aplicarla ahí bloquearía envíos perfectamente válidos.
    if (
      instancia.provider === WhatsappProviderKind.META &&
      !isWithinServiceWindow(params.lastInboundAt)
    ) {
      this.logger.warn(`Ventana de 24h cerrada (tenant ${params.tenantId}); envío omitido`);
      return { enviado: false, externalMessageId: null, motivo: 'ventana-cerrada' };
    }

    try {
      const { externalMessageId } = await this.provider.enviarTexto({
        externalId: instancia.externalId,
        credential: this.instancias.credencialDe(instancia),
        to: params.to,
        text: params.text,
      });
      return { enviado: true, externalMessageId, motivo: null };
    } catch (err) {
      this.logger.error(`Fallo enviando el mensaje: ${(err as Error).message}`);
      return { enviado: false, externalMessageId: null, motivo: 'error-proveedor' };
    }
  }
}
