import { NotFoundException } from '@nestjs/common';
import { RemindersService } from '../../src/reminders/reminders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RemindersService (aislamiento por tenant)', () => {
  function makeService(prisma: Record<string, unknown>): RemindersService {
    return new RemindersService(prisma as unknown as PrismaService);
  }

  const baseDto = {
    contactId: 'c1',
    message: 'Recordatorio de tu cita',
    remindAt: '2026-08-01T09:00:00.000Z',
  };

  it('create rechaza si el contacto no pertenece al tenant', async () => {
    const contactCount = jest.fn().mockResolvedValue(0);
    const create = jest.fn();
    const service = makeService({
      contact: { count: contactCount },
      appointment: { count: jest.fn() },
      reminder: { create },
    });

    await expect(service.create('t1', baseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('create rechaza si la cita referenciada no es del tenant', async () => {
    const service = makeService({
      contact: { count: jest.fn().mockResolvedValue(1) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      reminder: { create: jest.fn() },
    });

    await expect(
      service.create('t1', { ...baseDto, appointmentId: 'ap-de-otro' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create inyecta tenantId y convierte remindAt a Date', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'r1' });
    const service = makeService({
      contact: { count: jest.fn().mockResolvedValue(1) },
      appointment: { count: jest.fn() },
      reminder: { create },
    });

    await service.create('t1', baseDto);
    const arg = create.mock.calls[0][0];
    expect(arg.data.tenantId).toBe('t1');
    expect(arg.data.remindAt).toBeInstanceOf(Date);
  });
});
