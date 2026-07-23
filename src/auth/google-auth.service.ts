import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  fetchGoogleProfile,
  GoogleProfile,
  GoogleTokenResponse,
} from '../common/google-oauth.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthResult, GoogleAuthCallbackResult } from './auth.types';

const SCOPE = 'openid email profile';

interface LoginStatePayload {
  purpose: 'google-login';
}

interface PendingSignupPayload {
  purpose: 'google-signup';
  email: string;
  name: string;
  googleId: string;
}

/**
 * "Continuar con Google" para entrar a WhatsFlow — alternativa opcional al
 * login por email+contraseña, independiente de la integración de Google
 * Calendar (`google-calendar/`): esta es por usuario (identidad, scope mínimo
 * `openid email profile`), aquella es por tenant (acceso de escritura al
 * calendario). Un usuario puede tener una, la otra, ambas o ninguna.
 *
 * Alta de cuenta nueva en dos pasos porque Google no conoce el nombre de la
 * empresa: `handleCallback` devuelve `signup-required` con un token de alta
 * pendiente (corto, firmado) si el email no existe todavía; el panel pide el
 * nombre de la empresa y llama a `completeSignup`.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
  ) {
    this.clientId = this.config.get<string>('google.clientId') ?? '';
    this.clientSecret = this.config.get<string>('google.clientSecret') ?? '';
    this.redirectUri = this.config.get<string>('google.loginRedirectUri') ?? '';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  async buildLoginUrl(): Promise<string> {
    const state = await this.jwt.signAsync(
      { purpose: 'google-login' } satisfies LoginStatePayload,
      { expiresIn: '600s' },
    );
    return buildGoogleAuthUrl({ clientId: this.clientId, redirectUri: this.redirectUri, scope: SCOPE, state });
  }

  async handleCallback(code: string, state: string): Promise<GoogleAuthCallbackResult> {
    try {
      const statePayload = await this.jwt.verifyAsync<LoginStatePayload>(state);
      if (statePayload.purpose !== 'google-login') throw new Error('purpose inválido');
    } catch (err) {
      this.logger.warn(`Callback rechazado: state inválido/expirado (${(err as Error).message})`);
      throw new BadRequestException('Estado de OAuth inválido o expirado');
    }

    let tokens: GoogleTokenResponse;
    try {
      tokens = await exchangeGoogleAuthCode({
        code,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri: this.redirectUri,
      });
    } catch (err) {
      this.logger.error(`Fallo canjeando el código de Google: ${(err as Error).message}`);
      throw err;
    }

    let profile: GoogleProfile;
    try {
      profile = await fetchGoogleProfile(tokens.access_token);
    } catch (err) {
      this.logger.error(`Fallo obteniendo el perfil de Google: ${(err as Error).message}`);
      throw err;
    }

    if (!profile.email_verified) {
      this.logger.warn(`Login con Google rechazado: email ${profile.email} no verificado`);
      throw new BadRequestException('Tu cuenta de Google no tiene el email verificado');
    }

    const user = await this.prisma.user.findFirst({ where: { email: profile.email } });
    if (user) {
      if (!user.googleId) {
        await this.prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub } });
      }
      const result = await this.authService.issueToken(user);
      this.logger.log(`Login con Google: ${profile.email} autenticado (usuario existente)`);
      return { kind: 'authenticated', result };
    }

    const signupToken = await this.jwt.signAsync(
      {
        purpose: 'google-signup',
        email: profile.email,
        name: profile.name ?? profile.email,
        googleId: profile.sub,
      } satisfies PendingSignupPayload,
      { expiresIn: '900s' },
    );
    this.logger.log(`Login con Google: ${profile.email} requiere completar el alta (email nuevo)`);
    return { kind: 'signup-required', signupToken, email: profile.email, name: profile.name ?? profile.email };
  }

  /** Segundo paso del alta: falta el nombre de la empresa, que Google no provee. */
  async completeSignup(token: string, tenantName: string): Promise<AuthResult> {
    let payload: PendingSignupPayload;
    try {
      payload = await this.jwt.verifyAsync<PendingSignupPayload>(token);
      if (payload.purpose !== 'google-signup') throw new Error('purpose inválido');
    } catch {
      throw new BadRequestException('El enlace de alta con Google expiró; inténtalo de nuevo');
    }

    // Guarda contra condición de carrera: alguien pudo registrarse con ese
    // email por el flujo normal entre el callback y este segundo paso.
    const existing = await this.prisma.user.findFirst({ where: { email: payload.email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: tenantName,
        users: {
          create: {
            email: payload.email,
            name: payload.name,
            passwordHash: null,
            googleId: payload.googleId,
            role: UserRole.OWNER,
          },
        },
      },
      include: { users: true },
    });
    return this.authService.issueToken(tenant.users[0]);
  }
}
