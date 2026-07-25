import {
  describeNow,
  formatBusinessDateTime,
  resolveTimeZone,
} from '../../src/ai/ai-datetime.util';

describe('ai-datetime.util (fecha y zona horaria para la IA)', () => {
  // 3 de agosto de 2026, 21:00 UTC = 16:00 en Lima (UTC-5).
  const instante = new Date('2026-08-03T21:00:00Z');

  describe('resolveTimeZone', () => {
    it('acepta una zona válida', () => {
      expect(resolveTimeZone('Europe/Madrid')).toBe('Europe/Madrid');
    });

    it('degrada a la del servidor si la configurada es inválida', () => {
      // Una zona mal escrita haría fallar a Intl en CADA mensaje del cliente:
      // vale más responder con la zona del servidor que dejar de responder.
      const resuelta = resolveTimeZone('America/Limaa');
      expect(resuelta).not.toBe('America/Limaa');
      expect(() => new Intl.DateTimeFormat('es', { timeZone: resuelta })).not.toThrow();
    });

    it('sin configuración usa la del servidor', () => {
      const esperada = Intl.DateTimeFormat().resolvedOptions().timeZone;
      expect(resolveTimeZone(undefined)).toBe(esperada);
      expect(resolveTimeZone('')).toBe(esperada);
    });
  });

  describe('describeNow', () => {
    it('dice la fecha de hoy con el año, en la zona del negocio', () => {
      const lineas = describeNow(instante, 'America/Lima');
      expect(lineas[0]).toContain('3 de agosto de 2026');
      expect(lineas[0]).toContain('America/Lima');
      expect(lineas[0]).toContain('UTC-05:00');
    });

    it('el ejemplo de ISO usa la fecha real, para no enseñar un año equivocado', () => {
      const lineas = describeNow(instante, 'America/Lima').join('\n');
      expect(lineas).toContain('2026-08-03T15:00:00-05:00');
      // Y deja claro que UTC no sirve: es justo el error que cometía el modelo.
      expect(lineas).toMatch(/nunca en UTC/i);
    });

    it('calcula bien el desplazamiento de otras zonas', () => {
      expect(describeNow(instante, 'Europe/Madrid')[0]).toContain('UTC+02:00');
      expect(describeNow(instante, 'UTC')[0]).toContain('UTC+00:00');
    });

    it('la fecha cambia según la zona en el mismo instante', () => {
      // 2026-08-04T02:00Z es todavía el día 3 en Lima y ya el 4 en Madrid.
      const cruce = new Date('2026-08-04T02:00:00Z');
      expect(describeNow(cruce, 'America/Lima')[0]).toContain('3 de agosto');
      expect(describeNow(cruce, 'Europe/Madrid')[0]).toContain('4 de agosto');
    });
  });

  describe('formatBusinessDateTime', () => {
    it('muestra la hora local del negocio, no la UTC', () => {
      expect(formatBusinessDateTime(instante, 'America/Lima')).toContain('16:00');
      expect(formatBusinessDateTime(instante, 'America/Lima')).toContain('agosto');
    });

    it('el mismo instante se lee distinto en otra zona', () => {
      expect(formatBusinessDateTime(instante, 'Europe/Madrid')).toContain('23:00');
    });

    it('usa reloj de 24 horas (evita confundir 4 a.m. con 4 p.m.)', () => {
      const texto = formatBusinessDateTime(instante, 'America/Lima');
      expect(texto).not.toMatch(/a\.?\s?m\.?|p\.?\s?m\./i);
    });
  });
});
