import { CHUNK_CHARS, CHUNK_OVERLAP_CHARS } from './knowledge.constants';

/**
 * Parte un texto largo en fragmentos con solape, cortando en límites naturales.
 *
 * Se prefiere cortar en un salto de párrafo, luego en fin de oración y solo como
 * último recurso a mitad de texto: un fragmento que empieza en mitad de una
 * frase recupera peor y, si acaba en el prompt, se lee como si al negocio le
 * faltara información.
 *
 * El solape evita que una frase que cae justo en el corte quede partida entre
 * dos fragmentos y no se recupere bien por ninguno de los dos.
 */
export function chunkText(
  text: string,
  size: number = CHUNK_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  // El solape debe ser menor que el tamaño, o el avance sería nulo/negativo y
  // el bucle no terminaría.
  const safeOverlap = Math.min(overlap, Math.floor(size / 2));

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const hardEnd = Math.min(start + size, clean.length);

    // Última porción: entra completa, sin buscar un corte "bonito".
    if (hardEnd === clean.length) {
      const tail = clean.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const end = findBreakPoint(clean, start, hardEnd);
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    const next = end - safeOverlap;
    // Garantiza avance siempre, incluso si el corte quedó muy cerca del inicio.
    start = next > start ? next : end;
  }

  return chunks;
}

/**
 * Busca el mejor punto de corte dentro de la mitad final de la ventana: primero
 * un salto de párrafo, después un fin de oración. Si no hay ninguno, corta en
 * `hardEnd` (el límite duro de tamaño).
 */
function findBreakPoint(text: string, start: number, hardEnd: number): number {
  // Solo se acepta un corte en la segunda mitad; más atrás desperdiciaría
  // demasiado espacio del fragmento.
  const earliest = start + Math.floor((hardEnd - start) / 2);

  const paragraph = text.lastIndexOf('\n\n', hardEnd);
  if (paragraph > earliest) return paragraph;

  for (const terminator of ['. ', '.\n', '? ', '! ', '; ']) {
    const found = text.lastIndexOf(terminator, hardEnd);
    if (found > earliest) return found + terminator.length;
  }

  const space = text.lastIndexOf(' ', hardEnd);
  if (space > earliest) return space;

  return hardEnd;
}
