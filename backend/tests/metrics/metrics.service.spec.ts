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

  it('todas las agregaciones se filtran por tenantId y por el período', async () => {
    const { prisma, groupBy, count } = makePrisma();
    await new MetricsService(prisma).overview('t1');
    for (const call of groupBy.mock.calls) {
      expect(call[0].where.tenantId).toBe('t1');
      expect(call[0].where.createdAt).toEqual({ gte: expect.any(Date), lte: expect.any(Date) });
    }
    expect(count.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(count.mock.calls[0][0].where.createdAt).toBeDefined();
  });

  it('respeta el rango de fechas recibido (serie de N días)', async () => {
    const { prisma, queryRaw } = makePrisma();
    const to = new Date('2026-07-22T23:59:59.000Z');
    const from = new Date('2026-07-01T00:00:00.000Z'); // 22 días
    const res = await new MetricsService(prisma).overview('t1', { from, to });
    expect(res.activity).toHaveLength(22);
    // el SQL de actividad recibe since y until
    expect(queryRaw).toHaveBeenCalled();
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

  /**
   * `$queryRaw` lo comparten la serie de actividad y los tiempos de respuesta.
   * Se distinguen por el SQL que reciben: la plantilla llega como primer
   * argumento y la de tiempos es la única que usa `percentile_cont`.
   */
  function conTiemposDeRespuesta(queryRaw: jest.Mock, fila: unknown) {
    queryRaw.mockImplementation((plantilla: TemplateStringsArray) =>
      Promise.resolve(plantilla.raw.join('').includes('percentile_cont') ? [fila] : []),
    );
  }

  it('sin ninguna pareja entrante→saliente, los tiempos van a null y no a 0', async () => {
    const { prisma, queryRaw } = makePrisma();
    // Postgres devuelve NULL en los percentiles y en avg cuando no hay filas.
    conTiemposDeRespuesta(queryRaw, {
      samples: 0,
      median_seconds: null,
      average_seconds: null,
      ai_samples: 0,
      ai_median_seconds: null,
      human_samples: 0,
      human_median_seconds: null,
    });
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.responseTime.samples).toBe(0);
    // Un 0 aquí se leería como "se contesta al instante", que es lo contrario
    // de "no hay nada medido".
    expect(res.responseTime.medianSeconds).toBeNull();
    expect(res.responseTime.averageSeconds).toBeNull();
    expect(res.responseTime.aiMedianSeconds).toBeNull();
    expect(res.responseTime.humanMedianSeconds).toBeNull();
  });

  it('la consulta de tiempos no devuelve fila: tampoco inventa ceros', async () => {
    const { prisma, queryRaw } = makePrisma();
    queryRaw.mockResolvedValue([]);
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.responseTime).toEqual({
      samples: 0,
      medianSeconds: null,
      averageSeconds: null,
      aiSamples: 0,
      aiMedianSeconds: null,
      humanSamples: 0,
      humanMedianSeconds: null,
    });
  });

  it('redondea los segundos y separa lo que contestó la IA de lo que contestó una persona', async () => {
    const { prisma, queryRaw } = makePrisma();
    conTiemposDeRespuesta(queryRaw, {
      samples: 101,
      median_seconds: 8.4,
      // La media arrastrada por una respuesta nocturna: justo el motivo de que
      // la cifra principal del panel sea la mediana y no esta.
      average_seconds: 357.62,
      ai_samples: 100,
      ai_median_seconds: 8.2,
      human_samples: 1,
      human_median_seconds: 36000,
    });
    const res = await new MetricsService(prisma).overview('t1');
    expect(res.responseTime.samples).toBe(101);
    expect(res.responseTime.medianSeconds).toBe(8);
    expect(res.responseTime.averageSeconds).toBe(358);
    expect(res.responseTime.aiSamples).toBe(100);
    expect(res.responseTime.aiMedianSeconds).toBe(8);
    expect(res.responseTime.humanSamples).toBe(1);
    expect(res.responseTime.humanMedianSeconds).toBe(36000);
  });

  it('los tiempos de respuesta se piden acotados al tenant y al período', async () => {
    const { prisma, queryRaw } = makePrisma();
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-22T23:59:59.000Z');
    await new MetricsService(prisma).overview('t1', { from, to });
    const llamada = queryRaw.mock.calls.find((c) =>
      (c[0] as TemplateStringsArray).raw.join('').includes('percentile_cont'),
    );
    expect(llamada).toBeDefined();
    // Los valores interpolados van como parámetros del tagged template, nunca
    // concatenados al SQL.
    expect(llamada!.slice(1)).toEqual(['t1', expect.any(Date), to]);
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
