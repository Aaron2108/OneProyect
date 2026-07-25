import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { AiContextMemoryService } from './ai-context-memory.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiService } from './ai.service';
import { EmbeddingsService } from './embeddings.service';

@Module({
  // AppointmentsModule: para que create_appointment (tool-calling) pase por
  // AppointmentsService.create y sincronice con Google Calendar igual que una
  // cita creada desde el panel (antes hacía prisma.appointment.create directo
  // y se saltaba la sincronización — ver DECISIONS.md).
  imports: [BusinessProfileModule, AppointmentsModule],
  providers: [AiService, AiToolExecutorService, EmbeddingsService, AiContextMemoryService],
  exports: [AiService, AiContextMemoryService],
})
export class AiModule {}
