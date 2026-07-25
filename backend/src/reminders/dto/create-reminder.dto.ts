import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateReminderDto {
  @IsString()
  @IsNotEmpty()
  contactId!: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  /** Cuándo disparar el recordatorio (ISO-8601). */
  @IsDateString()
  remindAt!: string;
}
