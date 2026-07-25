import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiContextController } from './ai-context.controller';

/**
 * Solo expone el endpoint que compone el contexto de la IA para el panel. No
 * tiene servicios propios ni lo importa nadie: existe precisamente para poder
 * depender de `AiModule`, `KnowledgeModule` y `BusinessProfileModule` a la vez
 * sin crear un ciclo entre ellos.
 */
@Module({
  imports: [AuthModule, AiModule, KnowledgeModule, BusinessProfileModule],
  controllers: [AiContextController],
})
export class AiContextModule {}
