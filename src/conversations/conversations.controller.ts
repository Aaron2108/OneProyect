import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @Query() filters: ListConversationsDto) {
    return this.conversations.list(user.tenantId, filters);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.get(user.tenantId, id);
  }

  /** Un humano responde manualmente al cliente (persiste + envía por Meta). */
  @Post(':id/messages')
  @HttpCode(201)
  sendMessage(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.sendManualMessage(user.tenantId, id, dto.text);
  }

  /** RF-11: tomar la conversación como humano (silencia la IA). */
  @Post(':id/handoff')
  @HttpCode(200)
  handoff(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.handoffToHuman(user.tenantId, id);
  }

  /** RF-11: devolver la conversación a la IA. */
  @Post(':id/handback')
  @HttpCode(200)
  handback(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.handbackToAi(user.tenantId, id);
  }

  /** Cerrar la conversación. */
  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.setStatus(user.tenantId, id, ConversationStatus.CLOSED);
  }

  /** Reabrir la conversación. */
  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.setStatus(user.tenantId, id, ConversationStatus.OPEN);
  }
}
