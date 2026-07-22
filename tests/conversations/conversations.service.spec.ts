import { NotFoundException } from '@nestjs/common';
import {
  ConversationHandler,
  MessageDirection,
  MessageSender,
} from '@prisma/client';
import { ConversationsService } from '../../src/conversations/conversations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WhatsappSenderService } from '../../src/whatsapp/whatsapp-sender.service';

describe('ConversationsService (handoff RF-11 + aislamiento)', () => {
  const senderDisabled = {
    isEnabled: () => false,
    sendText: jest.fn(),
  } as unknown as WhatsappSenderService;

  function makePrisma(prisma: Record<string, unknown>): PrismaService {
    return prisma as unknown as PrismaService;
  }

  function makeService(
    prisma: Record<string, unknown>,
    sender: WhatsappSenderService = senderDisabled,
  ): ConversationsService {
    return new ConversationsService(makePrisma(prisma), sender);
  }

  it('list filtra por tenantId y ordena por actividad reciente', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = makeService({ conversation: { findMany } });
    await service.list('t1', {});
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ tenantId: 't1' });
    expect(arg.orderBy).toEqual({ lastMessageAt: 'desc' });
  });

  it('handoffToHuman cambia handledBy a HUMAN (silencia la IA)', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const update = jest.fn().mockResolvedValue({ id: 'cv1', handledBy: 'HUMAN' });
    const service = makeService({ conversation: { count, update } });

    await service.handoffToHuman('t1', 'cv1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cv1' },
      data: { handledBy: ConversationHandler.HUMAN },
    });
  });

  it('handbackToAi cambia handledBy a AI', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const update = jest.fn().mockResolvedValue({ id: 'cv1', handledBy: 'AI' });
    const service = makeService({ conversation: { count, update } });

    await service.handbackToAi('t1', 'cv1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cv1' },
      data: { handledBy: ConversationHandler.AI },
    });
  });

  it('no actualiza una conversación de otro tenant', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const update = jest.fn();
    const service = makeService({ conversation: { count, update } });

    await expect(service.handoffToHuman('t1', 'cv-de-otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  describe('sendManualMessage', () => {
    it('persiste OUTBOUND/HUMAN, pasa la conversación a HUMAN y NO envía sin credenciales', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'cv1',
        lastInboundAt: new Date(),
        contact: { phone: '5215500000000' },
        tenant: { whatsappPhoneNumberId: 'PN1' },
      });
      const create = jest.fn().mockResolvedValue({ id: 'm1', content: 'hola' });
      const update = jest.fn().mockResolvedValue({});
      const sendText = jest.fn();
      const service = makeService(
        { conversation: { findFirst, update }, message: { create } },
        { isEnabled: () => false, sendText } as unknown as WhatsappSenderService,
      );

      const msg = await service.sendManualMessage('t1', 'cv1', 'hola');

      expect(msg.id).toBe('m1');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: MessageDirection.OUTBOUND,
            sender: MessageSender.HUMAN,
            tenantId: 't1',
          }),
        }),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ handledBy: ConversationHandler.HUMAN }),
        }),
      );
      expect(sendText).not.toHaveBeenCalled(); // sender deshabilitado
    });

    it('envía por Meta y guarda el wamid cuando el sender está habilitado', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'cv1',
        lastInboundAt: new Date(),
        contact: { phone: '5215500000000' },
        tenant: { whatsappPhoneNumberId: 'PN1' },
      });
      const create = jest.fn().mockResolvedValue({ id: 'm1', content: 'hola' });
      const update = jest.fn().mockResolvedValue({});
      const messageUpdate = jest.fn().mockResolvedValue({});
      const sendText = jest.fn().mockResolvedValue({ messageId: 'wamid.OUT9' });
      const service = makeService(
        { conversation: { findFirst, update }, message: { create, update: messageUpdate } },
        { isEnabled: () => true, sendText } as unknown as WhatsappSenderService,
      );

      await service.sendManualMessage('t1', 'cv1', 'hola');

      expect(sendText).toHaveBeenCalledWith({
        phoneNumberId: 'PN1',
        to: '5215500000000',
        text: 'hola',
      });
      expect(messageUpdate).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { whatsappMessageId: 'wamid.OUT9' },
      });
    });

    it('lanza NotFound si la conversación no es del tenant', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const create = jest.fn();
      const service = makeService({ conversation: { findFirst }, message: { create } });

      await expect(
        service.sendManualMessage('t1', 'cv-de-otro', 'hola'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });
  });
});
