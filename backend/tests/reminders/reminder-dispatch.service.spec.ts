import { ConsentStatus, ReminderStatus } from '@prisma/client';
import {
  DueReminder,
  ReminderDispatchService,
} from '../../src/reminders/reminder-dispatch.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  ResultadoEnvioSaliente,
  WhatsappOutboundService,
} from '../../src/whatsapp/whatsapp-outbound.service';

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
      ...over,
    } as DueReminder;
  }

  /** Envío correcto por defecto: cada test declara solo el desenlace que prueba. */
  const ENVIADO: ResultadoEnvioSaliente = {
    enviado: true,
    externalMessageId: 'ext.R1',
    motivo: null,
  };

  function setup(opts: {
    /**
     * Qué contesta el canal. Las reglas de "se puede enviar o no" (sesión viva,
     * ventana de servicio) viven ahora en WhatsappOutboundService y se prueban
     * en su propio spec; aquí solo importa qué hace el despacho con cada
     * respuesta.
     */
    envio?: ResultadoEnvioSaliente;
    lastInboundAt?: Date | null;
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
    const enviarTexto = jest.fn().mockResolvedValue(opts.envio ?? ENVIADO);
    const outbound = { enviarTexto } as unknown as WhatsappOutboundService;
    return {
      service: new ReminderDispatchService(prisma, outbound),
      update,
      updateMany,
      findMany,
      enviarTexto,
    };
  }

  describe('dispatchOne', () => {
    it('cancela si el contacto no tiene consentimiento (RF-12)', async () => {
      const { service, update, enviarTexto } = setup();
      const reminder = makeReminder({
        contact: { phone: '5215500000000', consent: { status: ConsentStatus.UNKNOWN } },
      });

      expect(await service.dispatchOne(reminder, NOW)).toBe('cancelled-no-consent');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.CANCELLED },
      });
      expect(enviarTexto).not.toHaveBeenCalled();
    });

    it('aplaza (con backoff) si el canal de WhatsApp no está vinculado', async () => {
      const { service, update } = setup({
        envio: { enviado: false, externalMessageId: null, motivo: 'canal-desconectado' },
      });
      expect(await service.dispatchOne(makeReminder(), NOW)).toBe('deferred-no-config');
      // reprograma nextAttemptAt (sigue PENDING, no cambia status)
      const arg = update.mock.calls[0][0];
      expect(arg.data.nextAttemptAt).toBeInstanceOf(Date);
      expect(arg.data.status).toBeUndefined();
    });

    it('envía por el canal y marca SENT', async () => {
      const recentInbound = new Date(NOW.getTime() - 60 * 60 * 1000);
      const { service, update, enviarTexto } = setup({ lastInboundAt: recentInbound });

      expect(await service.dispatchOne(makeReminder(), NOW)).toBe('sent');
      // El destino sale del tenant, no de un número que el despacho conozca.
      expect(enviarTexto).toHaveBeenCalledWith({
        tenantId: 't1',
        to: '5215500000000',
        text: 'Recuerda tu cita mañana',
        lastInboundAt: recentInbound,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReminderStatus.SENT },
      });
    });

    it('aplaza (requiere plantilla) fuera de la ventana si aún no expiró', async () => {
      const { service, update } = setup({
        lastInboundAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000),
        envio: { enviado: false, externalMessageId: null, motivo: 'ventana-cerrada' },
      });
      const reminder = makeReminder({ remindAt: new Date(NOW.getTime() - 60 * 1000) });

      expect(await service.dispatchOne(reminder, NOW)).toBe('deferred-needs-template');
      expect(update.mock.calls[0][0].data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('cancela como expirado si lleva demasiado tiempo fuera de la ventana', async () => {
      const { service, update } = setup({
        lastInboundAt: null,
        envio: { enviado: false, externalMessageId: null, motivo: 'ventana-cerrada' },
      });
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
      const falla: ResultadoEnvioSaliente = {
        enviado: false,
        externalMessageId: null,
        motivo: 'error-proveedor',
      };
      const { service, update } = setup({
        lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        envio: falla,
      });

      expect(await service.dispatchOne(makeReminder({ attempts: 1 }), NOW)).toBe('deferred-send-failed');
      const arg = update.mock.calls[0][0];
      expect(arg.data.attempts).toBe(2);
      expect(arg.data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('cancela tras alcanzar el máximo de intentos de envío', async () => {
      const falla: ResultadoEnvioSaliente = {
        enviado: false,
        externalMessageId: null,
        motivo: 'error-proveedor',
      };
      const { service, update } = setup({
        lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        envio: falla,
      });
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
      const { service, enviarTexto, updateMany } = setup({
        findMany,
        lastInboundAt: recentInbound,
        claimCount: 1,
      });
      const tally = await service.dispatchDue(NOW);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(enviarTexto).toHaveBeenCalledTimes(1);
      expect(tally.sent).toBe(1);
    });

    it('NO procesa un recordatorio que otra instancia ya reclamó (count === 0)', async () => {
      const findMany = jest.fn().mockResolvedValue([makeReminder({ id: 'r1' })]);
      const { service, enviarTexto, update } = setup({ findMany, claimCount: 0 });
      const tally = await service.dispatchDue(NOW);
      expect(enviarTexto).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(Object.values(tally).every((n) => n === 0)).toBe(true);
    });
  });
});
