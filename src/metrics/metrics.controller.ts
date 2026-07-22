import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { MetricsOverview, MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Resumen de métricas del tenant autenticado. */
  @Get('overview')
  overview(@CurrentUser() user: AuthContext): Promise<MetricsOverview> {
    return this.metrics.overview(user.tenantId);
  }
}
