/**
 * Conversión entre el precio que se teclea y el que guarda el backend.
 *
 * Vive fuera del componente porque es la parte del catálogo que más caro sale
 * equivocar —la IA responde precios reales leyendo esta tabla— y porque así se
 * puede probar sin montar la página.
 */

import type { Product } from '@/lib/types';

/** Céntimos -> texto editable ("1990" -> "19.90"). */
export function centsToInput(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/**
 * Texto -> céntimos.
 *
 * Tres resultados distintos y los tres importan: `null` = el campo se dejó
 * vacío (producto sin precio), `undefined` = lo escrito no es un número válido
 * (hay que avisar y no guardar), y un número = céntimos. Acepta coma decimal
 * porque en España y Latinoamérica es lo que se teclea.
 */
export function inputToCents(valor: string): number | null | undefined {
  const limpio = valor.trim().replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export function formatPrice(product: Product): string {
  if (product.priceCents == null) return '—';
  const importe = (product.priceCents / 100).toFixed(2);
  return product.currency ? `${importe} ${product.currency}` : importe;
}
