import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { AiUsageService, AiUsageTotals } from '../ai/ai-usage.service';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { MetricsOverview, MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly aiUsage: AiUsageService,
  ) {}

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

  /**
   * Consumo real de la IA del tenant en el período: llamadas y tokens.
   *
   * Va aparte de `overview` porque responde a otra pregunta —cuánto cuesta, no
   * cuánto se trabajó— y porque su tabla crece a otro ritmo: mezclarlas
   * encarecería el resumen que se pide en cada carga del panel.
   */
  @Get('ai-usage')
  aiUsageTotals(
    @CurrentUser() user: AuthContext,
    @Query() query: MetricsQueryDto,
  ): Promise<AiUsageTotals> {
    return this.aiUsage.totals(
      user.tenantId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}
