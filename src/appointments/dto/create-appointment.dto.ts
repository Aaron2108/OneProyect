import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  contactId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** Fecha/hora en ISO-8601 (ej. 2026-08-01T15:30:00.000Z). */
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
