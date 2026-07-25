import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReminderDispatchService } from './reminder-dispatch.service';
import { ReminderProcessor } from './reminder.processor';
import { RemindersController } from './reminders.controller';
import { REMINDERS_QUEUE } from './reminders.constants';
import { RemindersService } from './reminders.service';

@Module({
  imports: [
    AuthModule,
    WhatsappModule, // aporta WhatsappSenderService para el envío
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
  ],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderDispatchService, ReminderProcessor],
})
export class RemindersModule {}
