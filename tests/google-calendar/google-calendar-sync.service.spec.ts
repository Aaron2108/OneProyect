import { AppointmentStatus } from '@prisma/client';
import { GoogleCalendarOauthService } from '../../src/google-calendar/google-calendar-oauth.service';
import { GoogleCalendarSyncService } from '../../src/google-calendar/google-calendar-sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function makeAppointment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a1',
    tenantId: 't1',
    title: 'Consulta',
    scheduledAt: new Date('2026-08-01T15:00:00.000Z'),
    status: AppointmentStatus.SCHEDULED,
    notes: null,
    googleEventId: null,
    ...overrides,
  } as never;
}

describe('GoogleCalendarSyncService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncOnCreate no hace nada si el tenant no tiene la integración conectada', async () => {
    const oauth = { isConfigured: () => true, getValidAccessToken: jest.fn().mockResolvedValue(null) } as unknown as GoogleCalendarOauthService;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const prisma = { appointment: { update: jest.fn() } } as unknown as PrismaService;
    const service = new GoogleCalendarSyncService(prisma, oauth);

    await service.syncOnCreate('t1', makeAppointment());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('syncOnCreate crea el evento y guarda el googleEventId', async () => {
    const oauth = {
      isConfigured: () => true,
      getValidAccessToken: jest.fn().mockResolvedValue('AT'),
      getCalendarId: jest.fn().mockResolvedValue('primary'),
    } as unknown as GoogleCalendarOauthService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'evt-1' }),
    }) as unknown as typeof fetch;
    const update = jest.fn().mockResolvedValue({});
    const prisma = { appointment: { update } } as unknown as PrismaService;
    const service = new GoogleCalendarSyncService(prisma, oauth);

    await service.syncOnCreate('t1', makeAppointment());
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { googleEventId: 'evt-1' } });
  });

  it('syncOnCreate no propaga el error si Google Calendar falla', async () => {
    const oauth = {
      isConfigured: () => true,
      getValidAccessToken: jest.fn().mockResolvedValue('AT'),
      getCalendarId: jest.fn().mockResolvedValue('primary'),
    } as unknown as GoogleCalendarOauthService;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const prisma = { appointment: { update: jest.fn() } } as unknown as PrismaService;
    const service = new GoogleCalendarSyncService(prisma, oauth);

    await expect(service.syncOnCreate('t1', makeAppointment())).resolves.toBeUndefined();
  });

  it('syncOnUpdate borra el evento cuando la cita se cancela', async () => {
    const oauth = {
      isConfigured: () => true,
      getValidAccessToken: jest.fn().mockResolvedValue('AT'),
      getCalendarId: jest.fn().mockResolvedValue('primary'),
    } as unknown as GoogleCalendarOauthService;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const update = jest.fn().mockResolvedValue({});
    const prisma = { appointment: { update } } as unknown as PrismaService;
    const service = new GoogleCalendarSyncService(prisma, oauth);

    await service.syncOnUpdate(
      't1',
      makeAppointment({ status: AppointmentStatus.CANCELLED, googleEventId: 'evt-1' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/evt-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { googleEventId: null } });
  });

  it('syncOnUpdate actualiza el evento existente cuando no se cancela', async () => {
    const oauth = {
      isConfigured: () => true,
      getValidAccessToken: jest.fn().mockResolvedValue('AT'),
      getCalendarId: jest.fn().mockResolvedValue('primary'),
    } as unknown as GoogleCalendarOauthService;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const prisma = { appointment: { update: jest.fn() } } as unknown as PrismaService;
    const service = new GoogleCalendarSyncService(prisma, oauth);

    await service.syncOnUpdate('t1', makeAppointment({ googleEventId: 'evt-1', title: 'Reagendada' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/evt-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
