import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { encryptSecret } from '../../src/common/crypto.util';
import { GoogleCalendarOauthService } from '../../src/google-calendar/google-calendar-oauth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const TOKEN_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='; // 32 bytes base64 de prueba

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'google.clientId': 'CLIENT_ID',
    'google.clientSecret': 'CLIENT_SECRET',
    'google.redirectUri': 'http://localhost:3000/integrations/google-calendar/callback',
    'security.tokenEncryptionKey': TOKEN_KEY,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('GoogleCalendarOauthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isConfigured es false si falta alguna credencial', () => {
    const jwt = {} as JwtService;
    const prisma = {} as PrismaService;
    const service = new GoogleCalendarOauthService(
      makeConfig({ 'google.clientSecret': '' }),
      prisma,
      jwt,
    );
    expect(service.isConfigured()).toBe(false);
  });

  it('buildAuthUrl incluye scope de calendar.events y el state', () => {
    const service = new GoogleCalendarOauthService(makeConfig(), {} as PrismaService, {} as JwtService);
    const url = service.buildAuthUrl('el-state');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=CLIENT_ID');
    expect(url).toContain('state=el-state');
    expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/calendar.events'));
  });

  it('handleCallback rechaza si Google no devuelve refresh_token', async () => {
    global.fetch = jest.fn()
      // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'AT', expires_in: 3600 }),
      }) as unknown as typeof fetch;

    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ tenantId: 't1', userId: 'u1' }) } as unknown as JwtService;
    const prisma = { googleCalendarIntegration: { upsert: jest.fn() } } as unknown as PrismaService;
    const service = new GoogleCalendarOauthService(makeConfig(), prisma, jwt);

    await expect(service.handleCallback('code', 'state')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('handleCallback guarda la integración con tokens cifrados', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'negocio@example.com' }),
      }) as unknown as typeof fetch;

    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ tenantId: 't1', userId: 'u1' }) } as unknown as JwtService;
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { googleCalendarIntegration: { upsert } } as unknown as PrismaService;
    const service = new GoogleCalendarOauthService(makeConfig(), prisma, jwt);

    await service.handleCallback('code', 'state');

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: 't1' });
    expect(arg.create.googleAccountEmail).toBe('negocio@example.com');
    // Los tokens no se guardan en claro.
    expect(arg.create.accessToken).not.toBe('AT');
    expect(arg.create.refreshToken).not.toBe('RT');
  });

  it('getValidAccessToken devuelve null si el tenant no tiene integración', async () => {
    const prisma = {
      googleCalendarIntegration: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new GoogleCalendarOauthService(makeConfig(), prisma, {} as JwtService);
    expect(await service.getValidAccessToken('t1')).toBeNull();
  });

  it('getValidAccessToken reutiliza el access token si no expiró', async () => {
    const encryptedAccess = encryptSecret('AT-vigente', TOKEN_KEY);
    const prisma = {
      googleCalendarIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          accessToken: encryptedAccess,
          refreshToken: 'irrelevante',
          accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      },
    } as unknown as PrismaService;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new GoogleCalendarOauthService(makeConfig(), prisma, {} as JwtService);

    expect(await service.getValidAccessToken('t1')).toBe('AT-vigente');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getValidAccessToken refresca cuando el access token expiró', async () => {
    const encryptedRefresh = encryptSecret('RT-valido', TOKEN_KEY);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      googleCalendarIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          accessToken: encryptSecret('AT-viejo', TOKEN_KEY),
          refreshToken: encryptedRefresh,
          accessTokenExpiresAt: new Date(Date.now() - 1000),
        }),
        update,
      },
    } as unknown as PrismaService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'AT-nuevo', expires_in: 3600 }),
    }) as unknown as typeof fetch;
    const service = new GoogleCalendarOauthService(makeConfig(), prisma, {} as JwtService);

    const token = await service.getValidAccessToken('t1');
    expect(token).toBe('AT-nuevo');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
