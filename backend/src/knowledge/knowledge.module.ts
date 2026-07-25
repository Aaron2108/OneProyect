import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../ai/embeddings.module';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeExtractorService } from './knowledge-extractor.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeVisionService } from './knowledge-vision.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * Conocimiento del negocio: documentos que el dueño sube para que la IA responda
 * con información real de su operación (ver docs/DECISIONS.md).
 *
 * Exporta solo `KnowledgeRetrievalService` porque es lo único que necesita
 * `AiModule` (recuperar fragmentos al armar el prompt). El resto —subida,
 * extracción, transcripción— es interno de este módulo.
 */
@Module({
  imports: [AuthModule, EmbeddingsModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    KnowledgeExtractorService,
    KnowledgeVisionService,
    KnowledgeRetrievalService,
  ],
  exports: [KnowledgeRetrievalService, KnowledgeService],
})
export class KnowledgeModule {}
