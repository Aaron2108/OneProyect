import { Body, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthResult } from './auth.types';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { GoogleAuthService } from './google-auth.service';

/**
 * "Continuar con Google" para entrar a WhatsFlow. Todas las rutas son
 * públicas: `start`/`callback` ocurren antes de tener sesión, y
 * `complete-signup` recibe su propia prueba de identidad vía el token firmado
 * del paso anterior (no un JWT de sesión).
 */
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  async start(): Promise<{ url: string }> {
    return { url: await this.googleAuth.buildLoginUrl() };
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
      this.logger.warn(`Callback de Google sin code/state (error=${error ?? 'n/a'})`);
      res.redirect(`${base}/#googleAuthError=1`);
      return;
    }
    try {
      const outcome = await this.googleAuth.handleCallback(code, state);
      if (outcome.kind === 'authenticated') {
        // El frontend espera el AuthResult completo (incluye `user`, no solo
        // el token) codificado en base64url en el fragmento de la URL — ver
        // AuthPage.tsx `decodeGoogleAuthResult`.
        const encoded = Buffer.from(JSON.stringify(outcome.result)).toString('base64url');
        res.redirect(`${base}/#googleAuth=${encoded}`);
      } else {
        const params = new URLSearchParams({
          googleSignup: outcome.signupToken,
          email: outcome.email,
          name: outcome.name,
        });
        res.redirect(`${base}/#${params.toString()}`);
      }
    } catch (err) {
      this.logger.error(`Callback de Google falló: ${(err as Error).message}`);
      res.redirect(`${base}/#googleAuthError=1`);
    }
  }

  @Post('complete-signup')
  completeSignup(@Body() dto: CompleteGoogleSignupDto): Promise<AuthResult> {
    return this.googleAuth.completeSignup(dto.token, dto.tenantName);
  }
}
