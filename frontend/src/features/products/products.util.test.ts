import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { centsToInput, formatPrice, inputToCents } from './products.util';

function producto(parcial: Partial<Product>): Product {
  return {
    id: 'p1',
    sku: null,
    name: 'Producto',
    description: null,
    priceCents: null,
    currency: null,
    stock: 0,
    active: true,
    ...parcial,
  };
}

describe('centsToInput', () => {
  it('siempre muestra dos decimales', () => {
    expect(centsToInput(1990)).toBe('19.90');
    expect(centsToInput(2000)).toBe('20.00');
    expect(centsToInput(5)).toBe('0.05');
  });

  it('sin precio, el campo queda vacío (no "0.00")', () => {
    expect(centsToInput(null)).toBe('');
  });
});

describe('inputToCents', () => {
  it('convierte a céntimos enteros', () => {
    expect(inputToCents('19.90')).toBe(1990);
    expect(inputToCents('20')).toBe(2000);
  });

  it('acepta la coma decimal, que es como se teclea aquí', () => {
    expect(inputToCents('19,90')).toBe(1990);
  });

  it('ignora los espacios de alrededor', () => {
    expect(inputToCents('  19.90  ')).toBe(1990);
  });

  it('vacío significa "sin precio", no error', () => {
    expect(inputToCents('')).toBeNull();
    expect(inputToCents('   ')).toBeNull();
  });

  it('devuelve undefined con lo que no es un precio', () => {
    expect(inputToCents('abc')).toBeUndefined();
    expect(inputToCents('-5')).toBeUndefined();
    expect(inputToCents('1e5000')).toBeUndefined(); // Infinity
  });

  it('redondea al céntimo en vez de truncar', () => {
    expect(inputToCents('19.999')).toBe(2000);
    expect(inputToCents('0.005')).toBe(1);
  });

  it('el céntimo no se pierde por el binario del float', () => {
    // 1.15 * 100 da 114.99999999999999 en coma flotante: sin `Math.round`
    // el producto se guardaría un céntimo más barato.
    expect(inputToCents('1.15')).toBe(115);
    expect(inputToCents('8.20')).toBe(820);
  });

  it('ida y vuelta sin desviarse', () => {
    for (const cents of [0, 1, 99, 100, 1990, 123456]) {
      expect(inputToCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('formatPrice', () => {
  it('añade la moneda cuando la hay', () => {
    expect(formatPrice(producto({ priceCents: 1990, currency: 'EUR' }))).toBe('19.90 EUR');
  });

  it('sin moneda, solo el importe', () => {
    expect(formatPrice(producto({ priceCents: 1990 }))).toBe('19.90');
  });

  it('sin precio, una raya y no "0.00"', () => {
    expect(formatPrice(producto({ priceCents: null, currency: 'EUR' }))).toBe('—');
  });
});
