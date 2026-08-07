import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ConversationFollowUpProcessor } from './conversation-follow-up.processor';
import { ConversationFollowUpService } from './conversation-follow-up.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { FOLLOW_UP_QUEUE } from './follow-up.constants';

@Module({
  // WhatsappModule aporta el envío por la abstracción del canal
  // (WhatsappOutboundService); AiModule aporta AiService (resumen/seguimiento)
  // y AiContextMemoryService (memoria de contexto, Fase 4) para guardar un
  // recuerdo del contacto al cerrar una conversación y generar el seguimiento
  // automático sin intervención humana; RealtimeModule, el aviso al panel.
  imports: [
    AuthModule,
    WhatsappModule,
    AiModule,
    RealtimeModule,
    BullModule.registerQueue({ name: FOLLOW_UP_QUEUE }),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationFollowUpService, ConversationFollowUpProcessor],
})
export class ConversationsModule {}
