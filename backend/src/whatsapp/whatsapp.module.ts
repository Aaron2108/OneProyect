import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChannelsController } from './channels.controller';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import { InboundMessageProcessor } from './inbound-message.processor';
import { EvolutionProvider } from './providers/evolution.provider';
import { MetaProvider } from './providers/meta.provider';
import { WHATSAPP_PROVIDER } from './providers/whatsapp-provider.interface';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappIngestService } from './whatsapp-ingest.service';
import { WhatsappInstanceService } from './whatsapp-instance.service';
import { WhatsappOutboundService } from './whatsapp-outbound.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappService } from './whatsapp.service';

/**
 * El canal de WhatsApp: conexión, webhooks, entrada y salida de mensajes.
 *
 * `WHATSAPP_PROVIDER` es el interruptor de toda la integración. Hoy apunta a
 * Evolution (vinculación por QR, puente del MVP); el día que Meta apruebe el
 * número se cambia `WHATSAPP_PROVIDER=meta` en el entorno y no hay nada más que
 * tocar — ni en la bandeja, ni en el worker, ni en el panel.
 *
 * Los dos proveedores se registran siempre, aunque solo uno esté activo: los
 * webhooks de cada uno los interpreta su propia implementación, y así un número
 * de Meta que siga entregando eventos durante la transición no se queda sin
 * quien lo entienda.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: WHATSAPP_INBOUND_QUEUE }),
    AiModule,
    AuthModule,
    RealtimeModule,
  ],
  controllers: [WhatsappController, EvolutionWebhookController, ChannelsController],
  providers: [
    WhatsappService,
    WhatsappSenderService,
    WhatsappInstanceService,
    WhatsappIngestService,
    WhatsappOutboundService,
    InboundMessageProcessor,
    EvolutionProvider,
    MetaProvider,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService, EvolutionProvider, MetaProvider],
      useFactory: (
        config: ConfigService,
        evolution: EvolutionProvider,
        meta: MetaProvider,
      ) => (config.get<string>('whatsapp.provider') === 'meta' ? meta : evolution),
    },
  ],
  // Hacia fuera solo salen la abstracción y los servicios que la envuelven.
  // `WhatsappSenderService` ya no se exporta: era la vía por la que el resto del
  // sistema hablaba con Meta directamente, y cerrarla es el punto del cambio.
  exports: [WhatsappOutboundService, WhatsappInstanceService],
})
export class WhatsappModule {}
