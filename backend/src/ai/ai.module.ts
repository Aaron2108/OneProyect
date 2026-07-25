import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiContextMemoryService } from './ai-context-memory.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiService } from './ai.service';
import { EmbeddingsModule } from './embeddings.module';
import { NvidiaChatService } from './nvidia-chat.service';
import { ProductsModule } from '../products/products.module';

@Module({
  // AppointmentsModule: para que create_appointment (tool-calling) pase por
  // AppointmentsService.create y sincronice con Google Calendar igual que una
  // cita creada desde el panel (antes hacía prisma.appointment.create directo
  // y se saltaba la sincronización — ver DECISIONS.md).
  //
  // KnowledgeModule: para recuperar los fragmentos de la documentación del
  // negocio relevantes al mensaje del cliente e inyectarlos en el system prompt.
  // ProductsModule: para que `consultar_producto` lea el stock en vivo de la BD.
  // El catálogo NUNCA se inyecta en el system prompt: un catálogo es una foto de
  // un momento y la IA prometería existencias que ya no hay (ver DECISIONS.md).
  imports: [
    BusinessProfileModule,
    AppointmentsModule,
    EmbeddingsModule,
    KnowledgeModule,
    ProductsModule,
  ],
  providers: [AiService, AiToolExecutorService, AiContextMemoryService, NvidiaChatService],
  exports: [AiService, AiContextMemoryService],
})
export class AiModule {}
