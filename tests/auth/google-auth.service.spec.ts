import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';
import { GoogleAuthService } from '../../src/auth/google-auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'google.clientId': 'CLIENT_ID',
    'google.clientSecret': 'CLIENT_SECRET',
    'google.loginRedirectUri': 'http://localhost:3000/auth/google/callback',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('GoogleAuthService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('isConfigured es false si falta alguna credencial', () => {
    const service = new GoogleAuthService(
      makeConfig({ 'google.loginRedirectUri': '' }),
      {} as PrismaService,
      {} as JwtService,
      {} as AuthService,
    );
    expect(service.isConfigured()).toBe(false);
  });

  it('buildLoginUrl pide scope openid+email+profile (no calendar)', async () => {
    const jwt = { signAsync: jest.fn().mockResolvedValue('state-token') } as unknown as JwtService;
    const service = new GoogleAuthService(makeConfig(), {} as PrismaService, jwt, {} as AuthService);

    const url = await service.buildLoginUrl();
    expect(url).toContain('scope=openid+email+profile');
    expect(url).not.toContain('calendar.events');
    expect(url).toContain('state=state-token');
  });

  it('handleCallback rechaza un state con purpose distinto', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ purpose: 'google-signup' }) } as unknown as JwtService;
    const service = new GoogleAuthService(makeConfig(), {} as PrismaService, jwt, {} as AuthService);

    await expect(service.handleCallback('code', 'state')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('handleCallback rechaza si el email de Google no está verificado', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ purpose: 'google-login' }) } as unknown as JwtService;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'g1', email: 'x@y.com', email_verified: false }) }) as unknown as typeof fetch;
    const service = new GoogleAuthService(makeConfig(), {} as PrismaService, jwt, {} as AuthService);

    await expect(service.handleCallback('code', 'state')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('handleCallback autentica y vincula googleId si el email ya existe', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ purpose: 'google-login' }) } as unknown as JwtService;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'g1', email: 'a@b.com', email_verified: true, name: 'Ana' }) }) as unknown as typeof fetch;
    const existingUser = { id: 'u1', email: 'a@b.com', googleId: null };
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(existingUser), update } } as unknown as PrismaService;
    const authService = { issueToken: jest.fn().mockResolvedValue({ accessToken: 'jwt', user: { id: 'u1' } }) } as unknown as AuthService;
    const service = new GoogleAuthService(makeConfig(), prisma, jwt, authService);

    const outcome = await service.handleCallback('code', 'state');
    expect(outcome).toEqual({ kind: 'authenticated', result: { accessToken: 'jwt', user: { id: 'u1' } } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { googleId: 'g1' } });
    expect(authService.issueToken).toHaveBeenCalledWith(existingUser);
  });

  it('handleCallback no reescribe googleId si el usuario ya tenía uno vinculado', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ purpose: 'google-login' }) } as unknown as JwtService;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'g1', email: 'a@b.com', email_verified: true }) }) as unknown as typeof fetch;
    const existingUser = { id: 'u1', email: 'a@b.com', googleId: 'g1-ya-vinculado' };
    const update = jest.fn();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(existingUser), update } } as unknown as PrismaService;
    const authService = { issueToken: jest.fn().mockResolvedValue({ accessToken: 'jwt', user: {} }) } as unknown as AuthService;
    const service = new GoogleAuthService(makeConfig(), prisma, jwt, authService);

    await service.handleCallback('code', 'state');
    expect(update).not.toHaveBeenCalled();
  });

  it('handleCallback devuelve signup-required si el email no existe', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ purpose: 'google-login' }),
      signAsync: jest.fn().mockResolvedValue('pending-signup-token'),
    } as unknown as JwtService;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'g1', email: 'nuevo@b.com', email_verified: true, name: 'Nuevo' }) }) as unknown as typeof fetch;
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService;
    const service = new GoogleAuthService(makeConfig(), prisma, jwt, {} as AuthService);

    const outcome = await service.handleCallback('code', 'state');
    expect(outcome).toEqual({
      kind: 'signup-required',
      signupToken: 'pending-signup-token',
      email: 'nuevo@b.com',
      name: 'Nuevo',
    });
  });

  describe('completeSignup', () => {
    it('crea el tenant + usuario OWNER sin contraseña', async () => {
      const jwt = {
        verifyAsync: jest.fn().mockResolvedValue({
          purpose: 'google-signup',
          email: 'nuevo@b.com',
          name: 'Nuevo',
          googleId: 'g1',
        }),
      } as unknown as JwtService;
      const created = { id: 'u2', tenantId: 't2', email: 'nuevo@b.com' };
      const tenantCreate = jest.fn().mockResolvedValue({ id: 't2', users: [created] });
      const prisma = {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        tenant: { create: tenantCreate },
      } as unknown as PrismaService;
      const authService = { issueToken: jest.fn().mockResolvedValue({ accessToken: 'jwt', user: created }) } as unknown as AuthService;
      const service = new GoogleAuthService(makeConfig(), prisma, jwt, authService);

      await service.completeSignup('pending-token', 'Mi Negocio');

      const arg = tenantCreate.mock.calls[0][0];
      expect(arg.data.name).toBe('Mi Negocio');
      expect(arg.data.users.create).toMatchObject({
        email: 'nuevo@b.com',
        passwordHash: null,
        googleId: 'g1',
        role: UserRole.OWNER,
      });
      expect(authService.issueToken).toHaveBeenCalledWith(created);
    });

    it('rechaza si el email ya se registró entre el callback y este paso', async () => {
      const jwt = {
        verifyAsync: jest.fn().mockResolvedValue({
          purpose: 'google-signup',
          email: 'ya-existe@b.com',
          name: 'X',
          googleId: 'g1',
        }),
      } as unknown as JwtService;
      const prisma = {
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
        tenant: { create: jest.fn() },
      } as unknown as PrismaService;
      const service = new GoogleAuthService(makeConfig(), prisma, jwt, {} as AuthService);

      await expect(service.completeSignup('pending-token', 'Mi Negocio')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });

    it('rechaza un token expirado o de otro propósito', async () => {
      const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('expirado')) } as unknown as JwtService;
      const service = new GoogleAuthService(makeConfig(), {} as PrismaService, jwt, {} as AuthService);

      await expect(service.completeSignup('token-malo', 'Mi Negocio')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
