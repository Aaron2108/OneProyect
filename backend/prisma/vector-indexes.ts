/**
 * Índices vectoriales de pgvector: qué son y por qué necesitan vigilancia.
 *
 * Se crean con SQL crudo porque Prisma no modela el tipo `vector`. La
 * consecuencia es que su motor de diff **no los ve**: al generar cualquier
 * migración los da por sobrantes y emite un `DROP INDEX` de cada uno. Si ese
 * SQL se aplica tal cual, los índices desaparecen sin ningún error — las
 * búsquedas siguen devolviendo resultados correctos, solo que recorriendo la
 * tabla entera.
 *
 * No es hipotético: la migración `business_profile` (2026-07-23) los borró sin
 * recrearlos y estuvo así hasta `embeddings_1024` (2026-07-25), dos días de
 * escaneo secuencial que nadie notó. Desde entonces ha vuelto a aparecer en las
 * tres migraciones siguientes, siempre quitado a mano.
 *
 * De ahí este módulo: define qué índices están protegidos y cómo se recrean,
 * para que la comprobación de las migraciones (`tests/prisma/`) y la de la base
 * en vivo (`check-vector-indexes.ts`) hablen de lo mismo.
 */

export interface VectorIndex {
  name: string;
  table: string;
  /** SQL exacto para recrearlo si falta. */
  createSql: string;
}

export const VECTOR_INDEXES: VectorIndex[] = [
  {
    name: 'ai_context_memory_embedding_idx',
    table: 'ai_context_memory',
    createSql:
      'CREATE INDEX "ai_context_memory_embedding_idx" ON "ai_context_memory" USING hnsw ("embedding" vector_cosine_ops);',
  },
  {
    name: 'knowledge_chunks_embedding_idx',
    table: 'knowledge_chunks',
    createSql:
      'CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);',
  },
];

/**
 * Migraciones ya aplicadas que borran un índice protegido sin recrearlo.
 *
 * Solo tiene una entrada, y es precisamente el incidente que motivó todo esto.
 * No se corrige reescribiendo el archivo: una migración ya aplicada es
 * inmutable, y editarla dejaría la suma de comprobación de Prisma sin cuadrar
 * en cualquier base donde ya corrió. El daño quedó reparado por
 * `embeddings_1024`, que los recrea.
 *
 * **Esta lista no debe crecer.** Una migración nueva que borre un índice
 * protegido sin recrearlo es un error a corregir en el archivo, no a añadir
 * aquí.
 */
export const MIGRACIONES_HISTORICAS_EXENTAS: string[] = ['20260723225015_business_profile'];

/** Un borrado de índice protegido detectado en una migración. */
export interface DropSinRecrear {
  migracion: string;
  indice: string;
}

/**
 * Busca migraciones que borren un índice protegido sin volver a crearlo.
 *
 * Borrarlo y recrearlo en el mismo archivo es legítimo y ocurre de verdad
 * (`embeddings_1024` los rehace al cambiar la dimensión del vector), así que lo
 * que se persigue no es el `DROP` sino el `DROP` huérfano.
 *
 * @param migraciones nombre de carpeta -> contenido de su `migration.sql`
 */
export function buscarDropsSinRecrear(
  migraciones: Record<string, string>,
): DropSinRecrear[] {
  const hallazgos: DropSinRecrear[] = [];

  for (const [migracion, sql] of Object.entries(migraciones)) {
    if (MIGRACIONES_HISTORICAS_EXENTAS.includes(migracion)) continue;

    for (const { name } of VECTOR_INDEXES) {
      const drop = new RegExp(`DROP\\s+INDEX\\s+(IF\\s+EXISTS\\s+)?"?${name}"?`, 'i');
      const create = new RegExp(`CREATE\\s+INDEX\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"?${name}"?`, 'i');
      // Los comentarios explican por qué se quitó el DROP: si no se ignoraran,
      // la propia advertencia haría saltar la comprobación.
      const sinComentarios = sql
        .split('\n')
        .filter((linea) => !linea.trimStart().startsWith('--'))
        .join('\n');

      const posDrop = sinComentarios.search(drop);
      if (posDrop === -1) continue;
      // Tiene que recrearse DESPUÉS del borrado; al revés no sirve de nada.
      const despues = sinComentarios.slice(posDrop);
      if (!create.test(despues)) {
        hallazgos.push({ migracion, indice: name });
      }
    }
  }

  return hallazgos;
}
