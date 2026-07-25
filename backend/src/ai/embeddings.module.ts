import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/**
 * Generación de embeddings, en su propio módulo porque la necesitan dos
 * consumidores independientes: la memoria de contexto por contacto (`AiModule`)
 * y el conocimiento del negocio (`KnowledgeModule`). Tenerla suelta dentro de
 * `AiModule` obligaría a que `KnowledgeModule` importara `AiModule`, y como
 * `AiModule` a su vez necesita el recall del conocimiento, eso sería una
 * dependencia circular.
 */
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
