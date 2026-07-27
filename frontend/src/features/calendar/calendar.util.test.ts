import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildMonthGrid,
  formatLongDate,
  formatTime,
  isSameDay,
  startOfMonth,
  toDateKey,
  toTimeInputValue,
} from './calendar.util';

describe('isSameDay', () => {
  it('compara el día, no la hora', () => {
    expect(isSameDay(new Date(2026, 6, 27, 0, 0), new Date(2026, 6, 27, 23, 59))).toBe(true);
  });

  it('distingue el mismo número de día en meses o años distintos', () => {
    expect(isSameDay(new Date(2026, 6, 27), new Date(2026, 7, 27))).toBe(false);
    expect(isSameDay(new Date(2025, 6, 27), new Date(2026, 6, 27))).toBe(false);
  });
});

describe('startOfMonth / addMonths', () => {
  it('startOfMonth se queda en el día 1 a medianoche', () => {
    const d = startOfMonth(new Date(2026, 6, 27, 18, 30));
    expect(toDateKey(d)).toBe('2026-07-01');
    expect(d.getHours()).toBe(0);
  });

  it('addMonths cruza el fin de año en los dos sentidos', () => {
    expect(toDateKey(addMonths(new Date(2026, 11, 15), 1))).toBe('2027-01-01');
    expect(toDateKey(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-01');
  });
});

describe('toDateKey', () => {
  it('rellena con ceros a la izquierda', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('usa la fecha local y no UTC (una cita de la noche no se va al día siguiente)', () => {
    // El día 31 a las 23:00 en hora local sigue siendo el 31 aunque en UTC ya
    // sea 1. Con `toISOString().slice(0,10)` esto fallaría según la zona.
    expect(toDateKey(new Date(2026, 6, 31, 23, 0))).toBe('2026-07-31');
  });
});

describe('toTimeInputValue / formatTime', () => {
  it('devuelve HH:mm con dos dígitos', () => {
    expect(toTimeInputValue(new Date(2026, 6, 27, 9, 5))).toBe('09:05');
  });

  it('formatTime acepta el ISO que devuelve la API', () => {
    const iso = new Date(2026, 6, 27, 16, 0).toISOString();
    expect(formatTime(iso)).toBe('16:00');
  });
});

describe('buildMonthGrid', () => {
  const grid = buildMonthGrid(new Date(2026, 6, 1)); // julio de 2026

  it('siempre son 6 semanas completas', () => {
    expect(grid).toHaveLength(42);
  });

  it('empieza en lunes', () => {
    expect(grid[0].date.getDay()).toBe(1);
  });

  it('marca qué días son del mes pedido', () => {
    // Julio de 2026 tiene 31 días.
    expect(grid.filter((d) => d.inCurrentMonth)).toHaveLength(31);
  });

  it('los días son consecutivos, sin huecos ni repetidos', () => {
    for (let i = 1; i < grid.length; i++) {
      const anterior = grid[i - 1].date;
      const esperado = new Date(anterior.getFullYear(), anterior.getMonth(), anterior.getDate() + 1);
      expect(toDateKey(grid[i].date)).toBe(toDateKey(esperado));
    }
  });

  it('un mes que empieza en domingo no deja la primera semana vacía', () => {
    // Noviembre de 2026 empieza en domingo: el peor caso del cálculo del
    // desplazamiento inicial (lunes = 0).
    const nov = buildMonthGrid(new Date(2026, 10, 1));
    expect(nov[0].date.getDay()).toBe(1);
    expect(nov.some((d) => d.inCurrentMonth)).toBe(true);
    expect(nov.filter((d) => d.inCurrentMonth)).toHaveLength(30);
  });
});

describe('formatLongDate', () => {
  it('empieza en mayúscula y no lleva año', () => {
    expect(formatLongDate(new Date(2026, 6, 27))).toBe('Lunes 27 de julio');
  });
});
