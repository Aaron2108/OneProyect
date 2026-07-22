import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from '../../src/appointments/appointments.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AppointmentsService (aislamiento por tenant)', () => {
  function makeService(prisma: Record<string, unknown>): AppointmentsService {
    return new AppointmentsService(prisma as unknown as PrismaService);
  }

  it('list filtra por tenantId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ appointment: { findMany } });
    await service.list('t1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', contactId: undefined } }),
    );
  });

  it('create rechaza si el contacto no pertenece al tenant', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const create = jest.fn();
    const service = makeService({ contact: { count }, appointment: { create } });

    await expect(
      service.create('t1', {
        contactId: 'c-de-otro',
        title: 'Consulta',
        scheduledAt: '2026-08-01T15:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('create inyecta tenantId y convierte la fecha', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const create = jest.fn().mockResolvedValue({ id: 'a1' });
    const service = makeService({ contact: { count }, appointment: { create } });

    await service.create('t1', {
      contactId: 'c1',
      title: 'Consulta',
      scheduledAt: '2026-08-01T15:00:00.000Z',
    });
    const arg = create.mock.calls[0][0];
    expect(arg.data.tenantId).toBe('t1');
    expect(arg.data.scheduledAt).toBeInstanceOf(Date);
  });

  it('get lanza NotFound si la cita no es del tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService({ appointment: { findFirst } });
    await expect(service.get('t1', 'a-de-otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
