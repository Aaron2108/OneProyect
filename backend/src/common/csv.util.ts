/**
 * Serializa filas a CSV. Escapa comillas/comas/saltos de línea según RFC 4180 y
 * antepone el BOM UTF-8 para que Excel abra bien los acentos.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const s = value == null ? '' : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
