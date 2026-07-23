import { ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from '../../src/users/users.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('UsersService (equipo por tenant)', () => {
  function makePrisma(user: Record<string, unknown>): PrismaService {
    return { user } as unknown as PrismaService;
  }

  it('list filtra por tenantId y NO expone passwordHash', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new UsersService(makePrisma({ findMany }));
    await service.list('t1');
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: 't1' });
    expect(arg.select.passwordHash).toBeUndefined();
    expect(arg.select).toMatchObject({ id: true, name: true, email: true, role: true });
  });

  it('invite crea un AGENT por defecto con el tenantId del contexto', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'u2' });
    const service = new UsersService(makePrisma({ findFirst, create }));

    await service.invite('t1', { name: 'Ana', email: 'ana@x.com', password: 'password123' });
    const data = create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.role).toBe(UserRole.AGENT);
    expect(data.passwordHash).not.toBe('password123'); // hasheada
  });

  it('invite respeta el rol solicitado', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'u3' });
    const service = new UsersService(makePrisma({ findFirst, create }));
    await service.invite('t1', {
      name: 'Beto', email: 'beto@x.com', password: 'password123', role: UserRole.OWNER,
    });
    expect(create.mock.calls[0][0].data.role).toBe(UserRole.OWNER);
  });

  it('invite rechaza si el email ya existe', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'u0' });
    const create = jest.fn();
    const service = new UsersService(makePrisma({ findFirst, create }));
    await expect(
      service.invite('t1', { name: 'X', email: 'dup@x.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('invite rechaza con ConflictException si la restricción única de la BD salta (condición de carrera)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null); // el chequeo previo no ve nada...
    const create = jest.fn().mockRejectedValue({ code: 'P2002' }); // ...pero otra alta ganó la carrera
    const service = new UsersService(makePrisma({ findFirst, create }));
    await expect(
      service.invite('t1', { name: 'X', email: 'dup@x.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
