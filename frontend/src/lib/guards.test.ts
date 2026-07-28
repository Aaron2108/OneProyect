import { describe, expect, it } from 'vitest';
import { esMetricsOverview } from './guards';

/** Respuesta mínima de /metrics/overview con todo lo que la pantalla recorre. */
function overview(extra: Record<string, unknown> = {}): unknown {
  return {
    conversations: { total: 0, open: 0, closed: 0, handledByAi: 0, handledByHuman: 0 },
    messages: { total: 0, inbound: 0, outbound: 0, fromContact: 0, fromAi: 0, fromHuman: 0 },
    contacts: { total: 0 },
    appointments: { total: 0, scheduled: 0, confirmed: 0, cancelled: 0, completed: 0 },
    reminders: { total: 0, pending: 0, sent: 0, cancelled: 0 },
    automationRate: 0,
    activity: [],
    ...extra,
  };
}

describe('esMetricsOverview', () => {
  it('acepta la respuesta completa', () => {
    expect(esMetricsOverview(overview({ responseTime: { samples: 0 } }))).toBe(true);
  });

  it('acepta una respuesta sin tiempo de respuesta', () => {
    // El caso que tumbó la pantalla: el bloque se añadió después y un backend
    // sin actualizar no lo manda. Las cifras que llegan son correctas, así que
    // rechazar la respuesta entera deja al usuario sin métricas por una
    // sección de apoyo. La pantalla oculta ese bloque y sigue.
    expect(esMetricsOverview(overview())).toBe(true);
  });

  it('rechaza lo que la pantalla desglosaría sin protección', () => {
    expect(esMetricsOverview(overview({ messages: null }))).toBe(false);
    expect(esMetricsOverview(overview({ automationRate: '0' }))).toBe(false);
    expect(esMetricsOverview(overview({ activity: null }))).toBe(false);
    expect(esMetricsOverview(null)).toBe(false);
  });
});
