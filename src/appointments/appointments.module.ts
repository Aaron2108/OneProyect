import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, GoogleCalendarModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  // AiModule la usa para que las citas creadas por la IA (tool-calling)
  // pasen por las mismas reglas de negocio que las creadas desde el panel
  // (sincronización con Google Calendar incluida) — ver ai-tool-executor.service.ts.
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
