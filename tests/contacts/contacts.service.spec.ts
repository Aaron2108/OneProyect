import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContactsService } from '../../src/contacts/contacts.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ContactsService (aislamiento por tenant)', () => {
  function makePrisma(contact: Record<string, unknown>): PrismaService {
    return { contact } as unknown as PrismaService;
  }

  it('list filtra por tenantId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ContactsService(makePrisma({ findMany }));
    await service.list('t1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } }),
    );
  });

  it('get lanza NotFound si el contacto no es del tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new ContactsService(makePrisma({ findFirst }));
    await expect(service.get('t1', 'c-de-otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'c-de-otro', tenantId: 't1' } });
  });

  it('create rechaza teléfono duplicado en el tenant', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'existente' });
    const create = jest.fn();
    const service = new ContactsService(makePrisma({ findUnique, create }));
    await expect(
      service.create('t1', { phone: '5215500000000' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('create inyecta el tenantId del token, no del cliente', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'c1' });
    const service = new ContactsService(makePrisma({ findUnique, create }));
    await service.create('t1', { phone: '5215500000000', name: 'Ana' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', phone: '5215500000000' }),
      }),
    );
  });
});
