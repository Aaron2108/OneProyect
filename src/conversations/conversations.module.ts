import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  // WhatsappModule aporta WhatsappSenderService; AiModule aporta AiService
  // (resumen) y AiContextMemoryService (memoria de contexto, Fase 4) para
  // guardar un recuerdo del contacto al cerrar una conversación.
  imports: [AuthModule, WhatsappModule, AiModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
