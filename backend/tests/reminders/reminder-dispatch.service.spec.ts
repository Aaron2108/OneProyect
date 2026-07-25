import { ConsentStatus, ReminderStatus } from '@prisma/client';
import {
  DueReminder,
  ReminderDispatchService,
} from '../../src/reminders/reminder-dispatch.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WhatsappSenderService } from '../../src/whatsapp/whatsapp-sender.service';

describe('ReminderDispatchService', () => {
  const NOW = new Date('2026-07-22T12:00:00.000Z');

  function makeReminder(over: Partial<DueReminder> = {}): DueReminder {
    return {
      id: 'r1',
      tenantId: 't1',
      contactId: 'c1',
      appointmentId: null,
      message: 'Recuerda tu cita mañana',
      remindAt: new Date(NOW.getTime() - 60 * 1000),
      status: ReminderStatus.PENDING,
      attempts: 0,
      nextAttemptAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      contact: { phone: '5215500000000', consent: { status: ConsentStatus.GRANTED } },
      tenant: { whatsappPhoneNumberId: 'PN1' },
      ...over,
    } as DueReminder;
  }

  function setup(opts: {
    senderEnabled?: boolean;
    lastInboundAt?: Date | null;
    sendImpl?: jest.Mock;
    claimCount?: number;
    findMany?: jest.Mock;
  } = {}) {
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 });
    const findMany = opts.findMany ?? jest.fn().mockResolvedValue([]);
    const conversationFindFirst = jest
      .fn()
      .mockResolvedValue(
        opts.lastInboundAt === undefined ? null : { lastInboundAt: opts.lastInboundAt },
      );
    const prisma = {
      reminder: { update, updateMany, findMany },
      conversation: { findFirst: conversationFindFirst },
    } as unknown as PrismaService;
    const sendText = opts.sendImpl ?? jest.fn().mockResolvedValue({ messageId: 'wamid.R1' });
    const sender = {
      isEnabled: () => opts.senderEnabled ?? true,
      sendText,
    } as unknown as WhatsappSenderService;
    return { service: new ReminderDispatchService(prisma, sender), update, updateMany, findMany, sendText };
  }

  describe('dispatchOne', () => {
    it('cancela si el contacto no tiene consentimiento (RF-12)', async () => {
      const { service, update, sendText } = setup();
      const reminder = makeReminder({
        contact: { phone: '5215500000000', consent: { status: ConsentStatus.UNKNOWN } },
      });

      expect(await service.dispatchOne(reminder, NOW)).toBe('cancelled-no-consent');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.CANCELLED },
      });
      expect(sendText).not.toHaveBeenCalled();
    });

    it('aplaza (con backoff) si el tenant no tiene número o el sender está deshabilitado', async () => {
      const { service, update, sendText } = setup({ senderEnabled: false });
      expect(await service.dispatchOne(makeReminder(), NOW)).toBe('deferred-no-config');
      // reprograma nextAttemptAt (sigue PENDING, no cambia status)
      const arg = update.mock.calls[0][0];
      expect(arg.data.nextAttemptAt).toBeInstanceOf(Date);
      expect(arg.data.status).toBeUndefined();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('envía y marca SENT dentro de la ventana de 24h', async () => {
      const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
      const { service, update, sendText } = setup({ lastInboundAt: recentInbound });

      expect(await service.dispatchOne(makeReminder(), NOW)).toBe('sent');
      expect(sendText).toHaveBeenCalledWith({
        phoneNumberId: 'PN1',
        to: '5215500000000',
        text: 'Recuerda tu cita mañana',
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.SENT },
      });
    });

    it('aplaza (requiere plantilla) fuera de la ventana si aún no expiró', async () => {
      const oldInbound = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
      const { service, update, sendText } = setup({ lastInboundAt: oldInbound });
      const reminder = makeReminder({ remindAt: new Date(NOW.getTime() - 60 * 1000) });

      expect(await service.dispatchOne(reminder, NOW)).toBe('deferred-needs-template');
      expect(sendText).not.toHaveBeenCalled();
      expect(update.mock.calls[0][0].data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('cancela como expirado si lleva demasiado tiempo fuera de la ventana', async () => {
      const { service, update } = setup({ lastInboundAt: null });
      const reminder = makeReminder({
        remindAt: new Date(NOW.getTime() - 96 * 60 * 60 * 1000),
      });

      expect(await service.dispatchOne(reminder, NOW)).toBe('expired-cancelled');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.CANCELLED },
      });
    });

    it('ante fallo de envío: incrementa intentos y reprograma con backoff', async () => {
      const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
      const sendImpl = jest.fn().mockRejectedValue(new Error('Meta 500'));
      const { service, update } = setup({ lastInboundAt: recentInbound, sendImpl });

      expect(await service.dispatchOne(makeReminder({ attempts: 1 }), NOW)).toBe('deferred-send-failed');
      const arg = update.mock.calls[0][0];
      expect(arg.data.attempts).toBe(2);
      expect(arg.data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('cancela tras alcanzar el máximo de intentos de envío', async () => {
      const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
      const sendImpl = jest.fn().mockRejectedValue(new Error('teléfono inválido'));
      const { service, update } = setup({ lastInboundAt: recentInbound, sendImpl });
      // attempts=4 → nextAttempts=5 = MAX_SEND_ATTEMPTS → cancela
      expect(await service.dispatchOne(makeReminder({ attempts: 4 }), NOW)).toBe('failed-cancelled');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.CANCELLED, attempts: 5 },
      });
    });
  });

  describe('dispatchDue (concurrencia)', () => {
    it('procesa solo los recordatorios cuyo claim atómico gana (count === 1)', async () => {
      const findMany = jest.fn().mockResolvedValue([makeReminder({ id: 'r1' })]);
      const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
      const { service, sendText, updateMany } = setup({
        findMany,
        lastInboundAt: recentInbound,
        claimCount: 1,
      });
      const tally = await service.dispatchDue(NOW);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(tally.sent).toBe(1);
    });

    it('NO procesa un recordatorio que otra instancia ya reclamó (count === 0)', async () => {
      const findMany = jest.fn().mockResolvedValue([makeReminder({ id: 'r1' })]);
      const { service, sendText, update } = setup({ findMany, claimCount: 0 });
      const tally = await service.dispatchDue(NOW);
      expect(sendText).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(Object.values(tally).every((n) => n === 0)).toBe(true);
    });
  });
});
