import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Actualización parcial de un contacto (el teléfono no se cambia aquí). */
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
