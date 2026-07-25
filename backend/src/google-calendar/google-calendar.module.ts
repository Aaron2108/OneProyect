import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarSyncProcessor } from './google-calendar-sync.processor';
import { GOOGLE_CALENDAR_SYNC_QUEUE } from './google-calendar.constants';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: GOOGLE_CALENDAR_SYNC_QUEUE })],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarOauthService, GoogleCalendarSyncService, GoogleCalendarSyncProcessor],
  exports: [GoogleCalendarSyncService],
})
export class GoogleCalendarModule {}
