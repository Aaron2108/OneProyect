import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashPassword } from '../../src/auth/password.util';

describe('AuthService', () => {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as JwtService;

  function makePrisma(overrides: Record<string, unknown>): PrismaService {
    return overrides as unknown as PrismaService;
  }

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('crea tenant + usuario OWNER y devuelve un token', async () => {
      const prisma = makePrisma({
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        tenant: {
          create: jest.fn().mockResolvedValue({
            id: 't1',
            users: [
              {
                id: 'u1',
                tenantId: 't1',
                email: 'a@b.com',
                name: 'Ana',
                role: UserRole.OWNER,
                passwordHash: 'x',
              },
            ],
          }),
        },
      });
      const service = new AuthService(prisma, jwt);

      const result = await service.register({
        tenantName: 'Empresa',
        name: 'Ana',
        email: 'a@b.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toMatchObject({ tenantId: 't1', role: UserRole.OWNER });
      // el rol OWNER y el hash de contraseña se pasan a Prisma
      const createArg = (prisma.tenant.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.users.create.role).toBe(UserRole.OWNER);
      expect(createArg.data.users.create.passwordHash).not.toBe('password123');
    });

    it('rechaza si el email ya existe', async () => {
      const prisma = makePrisma({
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u0' }) },
        tenant: { create: jest.fn() },
      });
      const service = new AuthService(prisma, jwt);

      await expect(
        service.register({ tenantName: 'X', name: 'Y', email: 'a@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('devuelve token con credenciales válidas', async () => {
      const passwordHash = await hashPassword('password123');
      const prisma = makePrisma({
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1',
            tenantId: 't1',
            email: 'a@b.com',
            name: 'Ana',
            role: UserRole.OWNER,
            passwordHash,
          }),
        },
      });
      const service = new AuthService(prisma, jwt);

      const result = await service.login({ email: 'a@b.com', password: 'password123' });
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rechaza con contraseña incorrecta', async () => {
      const passwordHash = await hashPassword('password123');
      const prisma = makePrisma({
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordHash }) },
      });
      const service = new AuthService(prisma, jwt);

      await expect(
        service.login({ email: 'a@b.com', password: 'incorrecta' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza si el usuario no existe', async () => {
      const prisma = makePrisma({
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const service = new AuthService(prisma, jwt);

      await expect(
        service.login({ email: 'noexiste@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('actualiza el hash si la contraseña actual es correcta', async () => {
      const passwordHash = await hashPassword('actual123');
      const update = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', passwordHash }), update },
      });
      const service = new AuthService(prisma, jwt);

      const res = await service.changePassword('u1', {
        currentPassword: 'actual123',
        newPassword: 'nueva12345',
      });
      expect(res).toEqual({ ok: true });
      const data = update.mock.calls[0][0].data;
      expect(data.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
      expect(data.passwordHash).not.toBe(passwordHash); // hash distinto (nueva contraseña)
    });

    it('rechaza si la contraseña actual es incorrecta', async () => {
      const passwordHash = await hashPassword('actual123');
      const update = jest.fn();
      const prisma = makePrisma({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', passwordHash }), update },
      });
      const service = new AuthService(prisma, jwt);

      await expect(
        service.changePassword('u1', { currentPassword: 'incorrecta', newPassword: 'nueva12345' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
