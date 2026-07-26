import { AiUsageService } from '../../src/ai/ai-usage.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AiUsageService', () => {
  let prisma: { aiUsage: { create: jest.Mock; groupBy: jest.Mock } };
  let service: AiUsageService;

  beforeEach(() => {
    prisma = {
      aiUsage: {
        create: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AiUsageService(prisma as unknown as PrismaService);
  });

  const usage = { inputTokens: 1200, outputTokens: 300, calls: 2 };

  describe('record', () => {
    it('apunta los tokens de la llamada con su finalidad', async () => {
      await service.record({
        tenantId: 't1',
        conversationId: 'cv1',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        purpose: 'respond',
        usage,
      });

      expect(prisma.aiUsage.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't1',
          conversationId: 'cv1',
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          purpose: 'respond',
          inputTokens: 1200,
          outputTokens: 300,
        },
      });
    });

    it('no apunta nada si no hubo llamadas', async () => {
      // El modo simulado no gasta: una fila de ceros ensuciaría el histórico
      // con actividad que nunca costó dinero.
      await service.record({
        tenantId: 't1',
        provider: 'mock',
        model: 'mock',
        purpose: 'respond',
        usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
      });
      expect(prisma.aiUsage.create).not.toHaveBeenCalled();
    });

    it('si falla la escritura no propaga: medir no puede costar la respuesta', async () => {
      // Perder una fila del histórico es aceptable; perder la conversación no.
      prisma.aiUsage.create.mockRejectedValue(new Error('BD caída'));
      await expect(
        service.record({
          tenantId: 't1',
          provider: 'anthropic',
          model: 'm',
          purpose: 'respond',
          usage,
        }),
      ).resolves.toBeUndefined();
    });

    it('sin conversación asociada guarda null, no un id inventado', async () => {
      // El resumen se genera al cerrar y ya no pertenece a ningún mensaje.
      await service.record({
        tenantId: 't1',
        provider: 'anthropic',
        model: 'm',
        purpose: 'summarize',
        usage,
      });
      expect(prisma.aiUsage.create.mock.calls[0][0].data.conversationId).toBeNull();
    });
  });

  describe('totals', () => {
    it('suma llamadas y tokens, y los desglosa por finalidad', async () => {
      prisma.aiUsage.groupBy.mockResolvedValue([
        { purpose: 'respond', _count: { _all: 10 }, _sum: { inputTokens: 5000, outputTokens: 900 } },
        { purpose: 'summarize', _count: { _all: 2 }, _sum: { inputTokens: 800, outputTokens: 100 } },
      ]);

      const totals = await service.totals('t1');

      expect(totals.calls).toBe(12);
      expect(totals.inputTokens).toBe(5800);
      expect(totals.outputTokens).toBe(1000);
      // El desglose permite ver qué parte del gasto es atender clientes y qué
      // parte es trabajo de fondo.
      expect(totals.byPurpose).toHaveLength(2);
    });

    it('un negocio sin actividad devuelve ceros, no falla', async () => {
      expect(await service.totals('t1')).toEqual({
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        byPurpose: [],
      });
    });

    it('consulta siempre acotada al tenant', async () => {
      await service.totals('t1');
      expect(prisma.aiUsage.groupBy.mock.calls[0][0].where.tenantId).toBe('t1');
    });

    it('aplica el rango de fechas cuando se pide', async () => {
      const from = new Date('2026-07-01T00:00:00Z');
      const to = new Date('2026-07-31T23:59:59Z');
      await service.totals('t1', from, to);
      expect(prisma.aiUsage.groupBy.mock.calls[0][0].where.createdAt).toEqual({ gte: from, lte: to });
    });

    it('tolera sumas nulas del agregado', async () => {
      // `_sum` viene null cuando el grupo no tiene filas con valor.
      prisma.aiUsage.groupBy.mockResolvedValue([
        { purpose: 'respond', _count: { _all: 1 }, _sum: { inputTokens: null, outputTokens: null } },
      ]);
      expect((await service.totals('t1')).inputTokens).toBe(0);
    });
  });
});
