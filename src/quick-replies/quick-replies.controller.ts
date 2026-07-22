import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { QuickReply } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';
import { QuickRepliesService } from './quick-replies.service';

@Controller('quick-replies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuickRepliesController {
  constructor(private readonly quickReplies: QuickRepliesService) {}

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<QuickReply[]> {
    return this.quickReplies.list(user.tenantId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateQuickReplyDto,
  ): Promise<QuickReply> {
    return this.quickReplies.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateQuickReplyDto,
  ): Promise<QuickReply> {
    return this.quickReplies.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.quickReplies.remove(user.tenantId, id);
  }
}
