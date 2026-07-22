import { ReminderStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;
}
