import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import { GoogleCalendarStatusDto } from './google-calendar.types';

/**
 * Conexión de Google Calendar por tenant (Fase 3). El callback (`GET /callback`)
 * lo invoca el navegador tras el consentimiento en Google, sin Bearer token —
 * por eso no lleva `JwtAuthGuard`; la identidad del tenant/usuario viaja en el
 * `state` firmado (ver GoogleCalendarOauthService.signState).
 */
@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  constructor(
    private readonly oauth: GoogleCalendarOauthService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  status(@CurrentUser() user: AuthContext): Promise<GoogleCalendarStatusDto> {
    return this.oauth.getStatus(user.tenantId);
  }

  @Get('connect-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async connectUrl(@CurrentUser() user: AuthContext): Promise<{ url: string }> {
    const state = await this.oauth.signState({ tenantId: user.tenantId, userId: user.userId });
    return { url: this.oauth.buildAuthUrl(state) };
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async disconnect(@CurrentUser() user: AuthContext): Promise<{ ok: true }> {
    await this.oauth.disconnect(user.tenantId);
    return { ok: true };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const base = this.config.get<string>('frontend.baseUrl') ?? '';
    if (error || !code || !state) {
      res.redirect(`${base}/?googleCalendar=error`);
      return;
    }
    try {
      await this.oauth.handleCallback(code, state);
      res.redirect(`${base}/?googleCalendar=connected`);
    } catch {
      res.redirect(`${base}/?googleCalendar=error`);
    }
  }
}
