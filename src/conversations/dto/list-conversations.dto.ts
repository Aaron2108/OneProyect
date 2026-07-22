import { ConversationHandler, ConversationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Filtros, búsqueda y paginación (keyset) de la bandeja. */
export class ListConversationsDto {
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsEnum(ConversationHandler)
  handledBy?: ConversationHandler;

  /** Búsqueda por nombre o teléfono del contacto. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /** Cursor keyset: id de la última conversación de la página anterior. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Tamaño de página (1-100, por defecto 25). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
