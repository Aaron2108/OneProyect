import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateContactDto {
  /** Teléfono en formato E.164 (solo dígitos, opcional prefijo +). */
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'phone debe ser un número en formato E.164 (ej. 5215500000000)',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
