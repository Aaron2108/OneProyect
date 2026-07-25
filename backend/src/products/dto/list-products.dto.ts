import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Búsqueda y paginación (keyset) del catálogo. */
export class ListProductsDto {
  /** Busca en nombre, SKU y descripción. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** 'true' para ver solo los activos. Sin esto, el panel los muestra todos. */
  @IsOptional()
  @IsBooleanString()
  onlyActive?: string;

  /** Cursor keyset: id del último producto de la página anterior. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
