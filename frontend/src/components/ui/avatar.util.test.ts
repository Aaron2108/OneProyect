import { describe, expect, it } from 'vitest';
import { GRADIENTS, gradientFromSeed, initials } from './avatar.util';

describe('gradientFromSeed', () => {
  it('el mismo contacto sale siempre del mismo color', () => {
    expect(gradientFromSeed('contacto-123')).toBe(gradientFromSeed('contacto-123'));
  });

  it('siempre devuelve un gradiente de la paleta', () => {
    for (const semilla of ['a', 'contacto-123', '5215500000000', '', 'ñ']) {
      expect(GRADIENTS).toContain(gradientFromSeed(semilla));
    }
  });

  it('reparte entre varios colores y no se queda en uno solo', () => {
    const usados = new Set(
      Array.from({ length: 50 }, (_, i) => gradientFromSeed(`contacto-${i}`)),
    );
    expect(usados.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('toma la inicial de las dos primeras palabras', () => {
    expect(initials('Ana Pérez', undefined)).toBe('AP');
    expect(initials('ana maría pérez lópez', undefined)).toBe('AM');
  });

  it('con una sola palabra devuelve una letra', () => {
    expect(initials('Ana', undefined)).toBe('A');
  });

  it('ignora los espacios de sobra', () => {
    expect(initials('   Ana   Pérez  ', undefined)).toBe('AP');
  });

  it('sin nombre usa los dos últimos dígitos del teléfono', () => {
    expect(initials(null, '5215500000042')).toBe('42');
    expect(initials('', '5215500000042')).toBe('42');
    expect(initials('   ', '5215500000042')).toBe('42');
  });

  it('sin nombre ni teléfono no revienta', () => {
    expect(initials(null, undefined)).toBe('?');
    expect(initials(undefined, undefined)).toBe('?');
  });
});
