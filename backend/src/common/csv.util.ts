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

/**
 * Detecta el separador de un CSV mirando su primera línea. Excel en español
 * exporta con `;` en vez de `,`: sin esto, la importación de cualquier tienda
 * que use Excel se leería como una sola columna.
 */
function detectDelimiter(firstLine: string): string {
  const comas = (firstLine.match(/,/g) ?? []).length;
  const puntoYComa = (firstLine.match(/;/g) ?? []).length;
  return puntoYComa > comas ? ';' : ',';
}

/**
 * Parsea CSV según RFC 4180: campos entrecomillados, comillas escapadas (`""`)
 * y saltos de línea dentro de un campo. Quita el BOM que antepone Excel.
 * Devuelve filas de strings sin interpretar la cabecera; las filas totalmente
 * vacías se descartan (un salto de línea final no cuenta como fila).
 */
export function parseCsv(text: string): string[][] {
  const limpio = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separador = detectDelimiter(limpio.split('\n', 1)[0] ?? '');

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((celda) => celda.trim() !== ''));
}
