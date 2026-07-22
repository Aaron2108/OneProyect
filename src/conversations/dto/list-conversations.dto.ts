import { ConversationHandler, ConversationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/** Filtros opcionales de la bandeja. */
export class ListConversationsDto {
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsEnum(ConversationHandler)
  handledBy?: ConversationHandler;
}
