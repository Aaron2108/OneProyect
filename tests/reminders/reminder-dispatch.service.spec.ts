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
  }) {
    const update = jest.fn().mockResolvedValue({});
    const conversationFindFirst = jest
      .fn()
      .mockResolvedValue(
        opts.lastInboundAt === undefined ? null : { lastInboundAt: opts.lastInboundAt },
      );
    const prisma = {
      reminder: { update },
      conversation: { findFirst: conversationFindFirst },
    } as unknown as PrismaService;
    const sendText = opts.sendImpl ?? jest.fn().mockResolvedValue({ messageId: 'wamid.R1' });
    const sender = {
      isEnabled: () => opts.senderEnabled ?? true,
      sendText,
    } as unknown as WhatsappSenderService;
    return { service: new ReminderDispatchService(prisma, sender), update, sendText };
  }

  it('cancela si el contacto no tiene consentimiento (RF-12)', async () => {
    const { service, update, sendText } = setup({});
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

  it('aplaza si el tenant no tiene número o el sender está deshabilitado', async () => {
    const { service, update, sendText } = setup({ senderEnabled: false });
    expect(await service.dispatchOne(makeReminder(), NOW)).toBe('deferred-no-config');
    expect(update).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('envía y marca SENT dentro de la ventana de 24h', async () => {
    const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000); // hace 1h
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
    const oldInbound = new Date(NOW.getTime() - 48 * 60 * 60 * 1000); // hace 48h
    const { service, update, sendText } = setup({ lastInboundAt: oldInbound });
    // remindAt reciente → no expirado
    const reminder = makeReminder({ remindAt: new Date(NOW.getTime() - 60 * 1000) });

    expect(await service.dispatchOne(reminder, NOW)).toBe('deferred-needs-template');
    expect(sendText).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled(); // sigue PENDING
  });

  it('cancela como expirado si lleva demasiado tiempo fuera de la ventana', async () => {
    const { service, update } = setup({ lastInboundAt: null });
    const reminder = makeReminder({
      remindAt: new Date(NOW.getTime() - 96 * 60 * 60 * 1000), // hace 96h (> 72h)
    });

    expect(await service.dispatchOne(reminder, NOW)).toBe('expired-cancelled');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReminderStatus.CANCELLED },
    });
  });

  it('aplaza si el envío a Meta falla (reintenta luego, sigue PENDING)', async () => {
    const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
    const sendImpl = jest.fn().mockRejectedValue(new Error('Meta 500'));
    const { service, update } = setup({ lastInboundAt: recentInbound, sendImpl });

    expect(await service.dispatchOne(makeReminder(), NOW)).toBe('deferred-send-failed');
    expect(update).not.toHaveBeenCalled(); // no cambia de estado
  });

  it('cancela un recordatorio expirado cuyo envío falla siempre (no reintenta para siempre)', async () => {
    const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000); // en ventana
    const sendImpl = jest.fn().mockRejectedValue(new Error('teléfono inválido'));
    const { service, update } = setup({ lastInboundAt: recentInbound, sendImpl });
    const reminder = makeReminder({
      remindAt: new Date(NOW.getTime() - 96 * 60 * 60 * 1000), // hace 96h (> 72h)
    });

    expect(await service.dispatchOne(reminder, NOW)).toBe('expired-cancelled');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReminderStatus.CANCELLED },
    });
  });
});
