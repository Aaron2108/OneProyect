import { Module } from '@nestjs/common';
import { AiContextMemoryService } from './ai-context-memory.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiService } from './ai.service';
import { EmbeddingsService } from './embeddings.service';

@Module({
  providers: [AiService, AiToolExecutorService, EmbeddingsService, AiContextMemoryService],
  exports: [AiService, AiContextMemoryService],
})
export class AiModule {}
