import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Búsqueda y paginación (keyset) de contactos. */
export class ListContactsDto {
  /** Búsqueda por nombre o teléfono. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /** Cursor keyset: id del último contacto de la página anterior. */
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
