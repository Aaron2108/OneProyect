import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarOauthService, GoogleCalendarSyncService],
  exports: [GoogleCalendarSyncService],
})
export class GoogleCalendarModule {}
