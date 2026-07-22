import { Module } from '@nestjs/common';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiService } from './ai.service';

@Module({
  providers: [AiService, AiToolExecutorService],
  exports: [AiService],
})
export class AiModule {}
