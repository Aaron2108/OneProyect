import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { MetricsOverview, MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Resumen de métricas del tenant en el período (por defecto, últimos 7 días). */
  @Get('overview')
  overview(
    @CurrentUser() user: AuthContext,
    @Query() query: MetricsQueryDto,
  ): Promise<MetricsOverview> {
    return this.metrics.overview(user.tenantId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
