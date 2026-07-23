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

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    appointment: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
    googleCalendarSyncJob: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('GoogleCalendarSyncService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncOnCreate / syncOnUpdate', () => {
    it('no hace nada si el tenant no tiene la integración conectada', async () => {
      const oauth = { isConfigured: () => true, getValidAccessToken: jest.fn().mockResolvedValue(null) } as unknown as GoogleCalendarOauthService;
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const prisma = makePrisma();
      const service = new GoogleCalendarSyncService(prisma, oauth);

      await service.syncOnCreate('t1', makeAppointment());
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('crea el evento y guarda el googleEventId', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'evt-1' }),
      }) as unknown as typeof fetch;
      const prisma = makePrisma();
      const service = new GoogleCalendarSyncService(prisma, oauth);

      await service.syncOnCreate('t1', makeAppointment());
      expect((prisma as any).appointment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { googleEventId: 'evt-1' },
      });
      // Éxito: no queda ningún job de reintento pendiente para esta cita.
      expect((prisma as any).googleCalendarSyncJob.deleteMany).toHaveBeenCalledWith({
        where: { appointmentId: 'a1' },
      });
    });

    it('agenda un reintento con backoff si Google Calendar falla (no propaga el error)', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
      const prisma = makePrisma();
      const service = new GoogleCalendarSyncService(prisma, oauth);

      await expect(service.syncOnCreate('t1', makeAppointment())).resolves.toBeUndefined();

      expect((prisma as any).googleCalendarSyncJob.upsert).toHaveBeenCalledTimes(1);
      const call = (prisma as any).googleCalendarSyncJob.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ appointmentId: 'a1' });
      expect(call.create.attempts).toBe(1);
      expect(call.create.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('borra el evento cuando la cita se cancela', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock as unknown as typeof fetch;
      const prisma = makePrisma();
      const service = new GoogleCalendarSyncService(prisma, oauth);

      await service.syncOnUpdate(
        't1',
        makeAppointment({ status: AppointmentStatus.CANCELLED, googleEventId: 'evt-1' }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/events/evt-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect((prisma as any).appointment.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { googleEventId: null },
      });
    });

    it('actualiza el evento existente cuando no se cancela', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock as unknown as typeof fetch;
      const prisma = makePrisma();
      const service = new GoogleCalendarSyncService(prisma, oauth);

      await service.syncOnUpdate('t1', makeAppointment({ googleEventId: 'evt-1', title: 'Reagendada' }));

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/events/evt-1'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('retryDue', () => {
    function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'job1',
        tenantId: 't1',
        appointmentId: 'a1',
        attempts: 1,
        nextAttemptAt: new Date('2026-08-01T00:00:00.000Z'),
        lastError: 'Google Calendar respondió 500 al crear el evento',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it('reprocesa un job vencido y lo limpia si Google responde bien', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'evt-2' }) }) as unknown as typeof fetch;
      const prisma = makePrisma({
        googleCalendarSyncJob: {
          findMany: jest.fn().mockResolvedValue([makeJob()]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          upsert: jest.fn(),
        },
      });
      (prisma as any).appointment.findUnique.mockResolvedValue(makeAppointment());
      const service = new GoogleCalendarSyncService(prisma, oauth);

      const result = await service.retryDue(new Date('2026-08-01T00:10:00.000Z'));

      expect(result).toEqual({ succeeded: 1, failed: 0 });
      expect((prisma as any).googleCalendarSyncJob.deleteMany).toHaveBeenCalledWith({
        where: { appointmentId: 'a1' },
      });
    });

    it('reprograma con backoff si vuelve a fallar', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
      const upsert = jest.fn();
      const prisma = makePrisma({
        googleCalendarSyncJob: {
          findMany: jest.fn().mockResolvedValue([makeJob({ attempts: 2 })]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          upsert,
        },
      });
      (prisma as any).appointment.findUnique.mockResolvedValue(makeAppointment());
      const service = new GoogleCalendarSyncService(prisma, oauth);

      const result = await service.retryDue(new Date('2026-08-01T00:10:00.000Z'));

      expect(result).toEqual({ succeeded: 0, failed: 1 });
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0][0].update.attempts).toBe(3);
    });

    it('abandona (sin reprogramar) tras agotar MAX_SYNC_ATTEMPTS', async () => {
      const oauth = {
        isConfigured: () => true,
        getValidAccessToken: jest.fn().mockResolvedValue('AT'),
        getCalendarId: jest.fn().mockResolvedValue('primary'),
      } as unknown as GoogleCalendarOauthService;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
      const upsert = jest.fn();
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = makePrisma({
        googleCalendarSyncJob: {
          findMany: jest.fn().mockResolvedValue([makeJob({ attempts: 8 })]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany,
          upsert,
        },
      });
      (prisma as any).appointment.findUnique.mockResolvedValue(makeAppointment());
      const service = new GoogleCalendarSyncService(prisma, oauth);

      const result = await service.retryDue(new Date('2026-08-01T00:10:00.000Z'));

      expect(result).toEqual({ succeeded: 0, failed: 1 });
      expect(upsert).not.toHaveBeenCalled();
      expect(deleteMany).toHaveBeenCalledWith({ where: { appointmentId: 'a1' } });
    });

    it('no reprocesa un job cuyo claim ya tomó otra instancia (count 0)', async () => {
      const oauth = { isConfigured: () => true } as unknown as GoogleCalendarOauthService;
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const prisma = makePrisma({
        googleCalendarSyncJob: {
          findMany: jest.fn().mockResolvedValue([makeJob()]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          deleteMany: jest.fn(),
          upsert: jest.fn(),
        },
      });
      const service = new GoogleCalendarSyncService(prisma, oauth);

      const result = await service.retryDue(new Date('2026-08-01T00:10:00.000Z'));

      expect(result).toEqual({ succeeded: 0, failed: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
