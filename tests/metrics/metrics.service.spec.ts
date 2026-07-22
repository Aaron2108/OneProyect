import { MetricsService } from '../../src/metrics/metrics.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('MetricsService', () => {
  function makePrisma() {
    const groupBy = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = {
      conversation: { groupBy },
      message: { groupBy },
      appointment: { groupBy },
      reminder: { groupBy },
      contact: { count },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    return { prisma, groupBy, count, queryRaw };
  }

  it('todas las agregaciones se filtran por tenantId', async () => {
    const { prisma, groupBy, count } = makePrisma();
    await new MetricsService(prisma).overview('t1');
    for (const call of groupBy.mock.calls) {
      expect(call[0].where).toEqual({ tenantId: 't1' });
    }
    expect(count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });

  it('calcula la tasa de automatización (IA / respuestas salientes)', async () => {
    const { prisma, groupBy } = makePrisma();
    // message.groupBy se llama 2 veces: por dirección y por sender.
    groupBy.mockImplementation((args: any) => {
      if (args.by[0] === 'sender') {
        return Promise.resolve([
          { sender: 'AI', _count: { _all: 3 } },
          { sender: 'HUMAN', _count: { _all: 1 } },
          { sender: 'CONTACT', _count: { _all: 4 } },
        ]);
      }
      return Promise.resolve([]);
    });
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.messages.fromAi).toBe(3);
    expect(res.messages.fromHuman).toBe(1);
    expect(res.automationRate).toBeCloseTo(0.75); // 3 / (3+1)
  });

  it('tasa de automatización 0 cuando no hay respuestas salientes', async () => {
    const { prisma } = makePrisma();
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.automationRate).toBe(0);
  });

  it('devuelve una serie de 7 días rellenando los vacíos con ceros', async () => {
    const { prisma, queryRaw } = makePrisma();
    queryRaw.mockResolvedValue([]); // sin actividad
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.activity).toHaveLength(7);
    expect(res.activity.every((d) => d.inbound === 0 && d.outbound === 0)).toBe(true);
    expect(res.activity[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
