import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  /** Código del negocio. Es la clave con la que la importación actualiza. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /**
   * Precio en céntimos (entero) a propósito: en dinero, el punto flotante
   * arrastra errores de redondeo. La interfaz y la importación convierten.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  /** ISO-4217 si el negocio la usa (ej. PEN, MXN, EUR). */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
