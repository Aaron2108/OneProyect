import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Filtro de citas: por contacto y/o rango de fechas (vista de calendario). */
export class ListAppointmentsDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
