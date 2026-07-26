import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Cada campo es texto libre y opcional: el negocio completa solo lo que quiere darle a la IA. */
export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  businessHours?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  services?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  policies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customInstructions?: string;

  /**
   * Zona horaria IANA del negocio (ej. "America/Lima"). No es texto libre como
   * el resto: el servicio comprueba que `Intl` la acepte antes de guardarla.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}
