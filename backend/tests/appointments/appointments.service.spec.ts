import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from '../../src/appointments/appointments.service';
import { GoogleCalendarSyncService } from '../../src/google-calendar/google-calendar-sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AppointmentsService (aislamiento por tenant)', () => {
  function makeGoogleCalendarStub(): GoogleCalendarSyncService {
    return {
      syncOnCreate: jest.fn().mockResolvedValue(undefined),
      syncOnUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as GoogleCalendarSyncService;
  }

  function makeService(
    prisma: Record<string, unknown>,
    googleCalendar: GoogleCalendarSyncService = makeGoogleCalendarStub(),
  ): AppointmentsService {
    return new AppointmentsService(prisma as unknown as PrismaService, googleCalendar);
  }

  it('list filtra por tenantId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ appointment: { findMany } });
    await service.list('t1', {});
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe('t1');
    expect(arg.where.contactId).toBeUndefined();
  });

  it('list filtra por rango de fechas (vista de calendario)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ appointment: { findMany } });
    await service.list('t1', { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.scheduledAt.gte).toBeInstanceOf(Date);
    expect(arg.where.scheduledAt.lte).toBeInstanceOf(Date);
    expect(arg.include).toEqual({ contact: { select: { id: true, name: true, phone: true } } });
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

  it('create inyecta tenantId y convierte la fecha, y sincroniza con Google Calendar', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const created = { id: 'a1' };
    const create = jest.fn().mockResolvedValue(created);
    const googleCalendar = makeGoogleCalendarStub();
    const service = makeService({ contact: { count }, appointment: { create } }, googleCalendar);

    await service.create('t1', {
      contactId: 'c1',
      title: 'Consulta',
      scheduledAt: '2026-08-01T15:00:00.000Z',
    });
    const arg = create.mock.calls[0][0];
    expect(arg.data.tenantId).toBe('t1');
    expect(arg.data.scheduledAt).toBeInstanceOf(Date);
    expect(googleCalendar.syncOnCreate).toHaveBeenCalledWith('t1', created);
  });

  it('update sincroniza con Google Calendar tras guardar el cambio', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'a1', tenantId: 't1' });
    const updated = { id: 'a1', status: 'CANCELLED' };
    const update = jest.fn().mockResolvedValue(updated);
    const googleCalendar = makeGoogleCalendarStub();
    const service = makeService(
      { appointment: { findFirst, update } },
      googleCalendar,
    );

    await service.update('t1', 'a1', { status: 'CANCELLED' } as never);
    expect(googleCalendar.syncOnUpdate).toHaveBeenCalledWith('t1', updated);
  });

  it('get lanza NotFound si la cita no es del tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService({ appointment: { findFirst } });
    await expect(service.get('t1', 'a-de-otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
