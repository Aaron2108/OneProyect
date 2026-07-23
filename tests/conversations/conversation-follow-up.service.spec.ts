import { MessageDirection, ReminderStatus } from '@prisma/client';
import { AiService } from '../../src/ai/ai.service';
import { ConversationFollowUpService } from '../../src/conversations/conversation-follow-up.service';
import { FOLLOW_UP_SOURCE } from '../../src/conversations/follow-up.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('ConversationFollowUpService', () => {
  const NOW = new Date('2026-07-24T12:00:00.000Z');
  const pii = makeTestPiiCrypto();

  function makeConversation(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'cv1',
      tenantId: 't1',
      contactId: 'c1',
      lastInboundAt: new Date(NOW.getTime() - 20 * 60 * 60 * 1000),
      lastMessageAt: new Date(NOW.getTime() - 18 * 60 * 60 * 1000), // saliente, más reciente que el entrante
      followUpCount: 0,
      tenant: { name: 'Empresa' },
      contact: { name: 'Ana', phone: '5210000000000' },
      messages: [
        { direction: MessageDirection.OUTBOUND, content: pii.encrypt('¿En qué te ayudo?') },
        { direction: MessageDirection.INBOUND, content: pii.encrypt('Hola, quiero info') },
      ],
      ...overrides,
    };
  }

  function makeService(opts: {
    findMany?: jest.Mock;
    updateMany?: jest.Mock;
    reminderCreate?: jest.Mock;
    generateFollowUp?: jest.Mock;
  } = {}) {
    const findMany = opts.findMany ?? jest.fn().mockResolvedValue([]);
    const updateMany = opts.updateMany ?? jest.fn().mockResolvedValue({ count: 1 });
    const reminderCreate = opts.reminderCreate ?? jest.fn().mockResolvedValue({});
    const prisma = {
      conversation: { findMany, updateMany },
      reminder: { create: reminderCreate },
    } as unknown as PrismaService;
    const generateFollowUp = opts.generateFollowUp ?? jest.fn().mockResolvedValue('¿Seguís por ahí?');
    const ai = { generateFollowUp } as unknown as AiService;
    return { service: new ConversationFollowUpService(prisma, ai, pii), findMany, updateMany, reminderCreate, generateFollowUp };
  }

  it('no hace nada si no hay conversaciones candidatas', async () => {
    const { service, reminderCreate } = makeService();
    const result = await service.scanAndSchedule(NOW);
    expect(result).toEqual({ scheduled: 0 });
    expect(reminderCreate).not.toHaveBeenCalled();
  });

  it('programa un seguimiento: reclama la conversación, genera el texto y crea el Reminder', async () => {
    const findMany = jest.fn().mockResolvedValue([makeConversation()]);
    const { service, updateMany, reminderCreate, generateFollowUp } = makeService({ findMany });

    const result = await service.scanAndSchedule(NOW);

    expect(result).toEqual({ scheduled: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'cv1', followUpCount: 0 },
      data: { followUpCount: { increment: 1 }, lastFollowUpAt: NOW },
    });
    expect(generateFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', tenantName: 'Empresa', contactId: 'c1', contactName: 'Ana' }),
      [
        { role: 'user', text: 'Hola, quiero info' },
        { role: 'assistant', text: '¿En qué te ayudo?' },
      ],
    );
    expect(reminderCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        contactId: 'c1',
        message: '¿Seguís por ahí?',
        remindAt: NOW,
        status: ReminderStatus.PENDING,
        source: FOLLOW_UP_SOURCE,
      },
    });
  });

  it('no programa nada si el contacto ya respondió (el último mensaje fue entrante)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeConversation({
        lastInboundAt: new Date(NOW.getTime() - 1000),
        lastMessageAt: new Date(NOW.getTime() - 2000),
      }),
    ]);
    const { service, updateMany, reminderCreate } = makeService({ findMany });

    const result = await service.scanAndSchedule(NOW);

    expect(result).toEqual({ scheduled: 0 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(reminderCreate).not.toHaveBeenCalled();
  });

  it('no crea el Reminder si otra instancia ya reclamó la conversación (claim count 0)', async () => {
    const findMany = jest.fn().mockResolvedValue([makeConversation()]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { service, reminderCreate, generateFollowUp } = makeService({ findMany, updateMany });

    const result = await service.scanAndSchedule(NOW);

    expect(result).toEqual({ scheduled: 0 });
    expect(generateFollowUp).not.toHaveBeenCalled();
    expect(reminderCreate).not.toHaveBeenCalled();
  });

  it('no propaga el error si la IA falla al generar el seguimiento (best-effort)', async () => {
    const findMany = jest.fn().mockResolvedValue([makeConversation()]);
    const generateFollowUp = jest.fn().mockRejectedValue(new Error('modelo caído'));
    const { service, reminderCreate } = makeService({ findMany, generateFollowUp });

    const result = await service.scanAndSchedule(NOW);

    expect(result).toEqual({ scheduled: 0 });
    expect(reminderCreate).not.toHaveBeenCalled();
  });

  it('no crea el Reminder si la IA devuelve un texto vacío', async () => {
    const findMany = jest.fn().mockResolvedValue([makeConversation()]);
    const generateFollowUp = jest.fn().mockResolvedValue('');
    const { service, reminderCreate } = makeService({ findMany, generateFollowUp });

    const result = await service.scanAndSchedule(NOW);

    expect(result).toEqual({ scheduled: 0 });
    expect(reminderCreate).not.toHaveBeenCalled();
  });
});
