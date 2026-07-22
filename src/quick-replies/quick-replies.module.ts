import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';

@Module({
  imports: [AuthModule],
  controllers: [QuickRepliesController],
  providers: [QuickRepliesService],
})
export class QuickRepliesModule {}
