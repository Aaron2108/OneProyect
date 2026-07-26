import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenUsage } from './ai.types';

/** Para qué se llamó al modelo. Separa la atención al cliente del trabajo de fondo. */
export type AiPurpose = 'respond' | 'summarize' | 'follow-up';

/** Consumo agregado de un negocio en una ventana de tiempo. */
export interface AiUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Desglose por finalidad, para saber qué parte del gasto es cada cosa. */
  byPurpose: Array<{ purpose: string; calls: number; inputTokens: number; outputTokens: number }>;
}

/**
 * Registro del consumo real de la IA.
 *
 * La guarda de costo cuenta MENSAJES y eso basta para poner un techo, pero no
 * dice cuánto se gasta: una respuesta con tool-calling encadena varias llamadas
 * y cuenta como una sola. Aquí se apunta cada llamada tal y como la factura el
 * proveedor.
 *
 * Se guardan tokens y no dinero a propósito: el precio por modelo cambia con el
 * tiempo y no se inventa en el código. Con los tokens y la tarifa vigente, la
 * cuenta se hace cuando haga falta; al revés no — un importe calculado con una
 * tarifa vieja queda mal para siempre.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apunta el consumo de una llamada (o de una tanda de tool-calling).
   *
   * **Nunca propaga**: medir el gasto no puede costarle la respuesta al cliente.
   * Si esta escritura falla, se pierde una fila del histórico; si propagara,
   * se perdería la conversación.
   */
  async record(params: {
    tenantId: string;
    conversationId?: string | null;
    provider: string;
    model: string;
    purpose: AiPurpose;
    usage: TokenUsage;
  }): Promise<void> {
    const { usage } = params;
    // Sin llamadas no hay nada que apuntar: el modo simulado no gasta, y una
    // fila de ceros ensuciaría el histórico con actividad que no costó nada.
    if (usage.calls === 0) return;

    try {
      await this.prisma.aiUsage.create({
        data: {
          tenantId: params.tenantId,
          conversationId: params.conversationId ?? null,
          provider: params.provider,
          model: params.model,
          purpose: params.purpose,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo registrar el consumo de IA: ${(err as Error).message}`);
    }
  }

  /** Consumo de un negocio entre dos fechas. El tenant viene del token, nunca del cliente. */
  async totals(tenantId: string, from?: Date, to?: Date): Promise<AiUsageTotals> {
    const where = {
      tenantId,
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const porFinalidad = await this.prisma.aiUsage.groupBy({
      by: ['purpose'],
      where,
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });

    const byPurpose = porFinalidad.map((f) => ({
      purpose: f.purpose,
      calls: f._count._all,
      inputTokens: f._sum.inputTokens ?? 0,
      outputTokens: f._sum.outputTokens ?? 0,
    }));

    return {
      calls: byPurpose.reduce((n, f) => n + f.calls, 0),
      inputTokens: byPurpose.reduce((n, f) => n + f.inputTokens, 0),
      outputTokens: byPurpose.reduce((n, f) => n + f.outputTokens, 0),
      byPurpose,
    };
  }
}
