import { NotFoundException } from '@nestjs/common';
import { ConversationHandler } from '@prisma/client';
import { ConversationsService } from '../../src/conversations/conversations.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ConversationsService (handoff RF-11 + aislamiento)', () => {
  function makePrisma(conversation: Record<string, unknown>): PrismaService {
    return { conversation } as unknown as PrismaService;
  }

  it('list filtra por tenantId y ordena por actividad reciente', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ConversationsService(makePrisma({ findMany }));
    await service.list('t1', {});
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ tenantId: 't1' });
    expect(arg.orderBy).toEqual({ lastMessageAt: 'desc' });
  });

  it('handoffToHuman cambia handledBy a HUMAN (silencia la IA)', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const update = jest.fn().mockResolvedValue({ id: 'cv1', handledBy: 'HUMAN' });
    const service = new ConversationsService(makePrisma({ count, update }));

    await service.handoffToHuman('t1', 'cv1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cv1' },
      data: { handledBy: ConversationHandler.HUMAN },
    });
  });

  it('handbackToAi cambia handledBy a AI', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const update = jest.fn().mockResolvedValue({ id: 'cv1', handledBy: 'AI' });
    const service = new ConversationsService(makePrisma({ count, update }));

    await service.handbackToAi('t1', 'cv1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cv1' },
      data: { handledBy: ConversationHandler.AI },
    });
  });

  it('no actualiza una conversación de otro tenant', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const update = jest.fn();
    const service = new ConversationsService(makePrisma({ count, update }));

    await expect(service.handoffToHuman('t1', 'cv-de-otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
