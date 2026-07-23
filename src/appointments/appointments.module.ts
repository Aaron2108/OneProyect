import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, GoogleCalendarModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
