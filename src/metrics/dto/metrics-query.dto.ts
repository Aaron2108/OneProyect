import { IsDateString, IsOptional } from 'class-validator';

/** Rango de fechas opcional para el dashboard (por defecto, últimos 7 días). */
export class MetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
