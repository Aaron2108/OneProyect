import {
  Body,
  Controller,
  Get,
  Header,
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
import { RolesGuard } from '../auth/roles.decorator';
import { ConversationsService } from './conversations.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @Query() filters: ListConversationsDto) {
    return this.conversations.list(user.tenantId, filters);
  }

  /** Exporta las conversaciones a CSV. (Debe ir antes de `:id`.) */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="conversaciones.csv"')
  export(@CurrentUser() user: AuthContext): Promise<string> {
    return this.conversations.exportCsv(user.tenantId);
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

  /** Notas internas del equipo sobre la conversación (no se envían al cliente). */
  @Get(':id/notes')
  listNotes(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.listNotes(user.tenantId, id);
  }

  @Post(':id/notes')
  @HttpCode(201)
  addNote(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.conversations.addNote(user.tenantId, id, { userId: user.userId }, dto.body);
  }

  /** Marca la conversación como leída (contador de sin leer a 0). */
  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.conversations.markRead(user.tenantId, id);
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
