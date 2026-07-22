import { NotFoundException } from '@nestjs/common';
import { QuickRepliesService } from '../../src/quick-replies/quick-replies.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('QuickRepliesService (por tenant)', () => {
  function makeService(quickReply: Record<string, unknown>): QuickRepliesService {
    return new QuickRepliesService({ quickReply } as unknown as PrismaService);
  }

  it('list filtra por tenantId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await makeService({ findMany }).list('t1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } }),
    );
  });

  it('create inyecta el tenantId del token', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    await makeService({ create }).create('t1', { title: 'Saludo', body: 'Hola 👋' });
    expect(create).toHaveBeenCalledWith({
      data: { tenantId: 't1', title: 'Saludo', body: 'Hola 👋' },
    });
  });

  it('update/remove exigen que la respuesta sea del tenant', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const update = jest.fn();
    const del = jest.fn();
    const service = makeService({ count, update, delete: del });
    await expect(service.update('t1', 'q-de-otro', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('t1', 'q-de-otro')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
