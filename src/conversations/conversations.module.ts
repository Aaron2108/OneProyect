import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AuthModule, WhatsappModule], // WhatsappModule aporta WhatsappSenderService
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
