import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InboundMessageProcessor } from './inbound-message.processor';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp.constants';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: WHATSAPP_INBOUND_QUEUE }),
    AiModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappSenderService, InboundMessageProcessor],
  exports: [WhatsappService, WhatsappSenderService],
})
export class WhatsappModule {}
