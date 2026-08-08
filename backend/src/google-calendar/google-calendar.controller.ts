import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarCheckDto, GoogleCalendarStatusDto } from './google-calendar.types';

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
    private readonly sync: GoogleCalendarSyncService,
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

  /**
   * Comprueba contra Google que la conexión sirve y sube lo que quedara
   * pendiente.
   *
   * Existe porque "conectado" en el panel solo significaba que hay una fila
   * guardada: si alguien retira el permiso desde su cuenta de Google, aquí se
   * seguía viendo todo correcto mientras las citas no llegaban a ningún sitio.
   * Esto lo convierte en algo verificado, con fecha.
   */
  @Post('check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async check(@CurrentUser() user: AuthContext): Promise<GoogleCalendarCheckDto> {
    const { ok } = await this.oauth.comprobarConexion(user.tenantId);

    // Si la conexión no responde no se intenta subir nada: fallarían todas y
    // cada fallo gasta un intento de los que tiene la cita antes de que se
    // abandone su sincronización.
    const { succeeded } = ok
      ? await this.sync.retryDue(new Date(), { tenantId: user.tenantId, forzar: true })
      : { succeeded: 0 };

    return {
      status: await this.oauth.getStatus(user.tenantId),
      ok,
      sincronizadas: succeeded,
    };
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
    // Se vuelve a /calendario, que es donde vive la tarjeta de la integración.
    // Antes se redirigía a la raíz: el panel la reenvía a la bandeja y descarta
    // los parámetros, así que el resultado de la conexión no se veía nunca.
    const destino = `${base}/calendario`;
    if (error || !code || !state) {
      res.redirect(`${destino}?googleCalendar=error`);
      return;
    }
    try {
      await this.oauth.handleCallback(code, state);
      res.redirect(`${destino}?googleCalendar=connected`);
    } catch {
      res.redirect(`${destino}?googleCalendar=error`);
    }
  }
}
