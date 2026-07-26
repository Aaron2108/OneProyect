import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
