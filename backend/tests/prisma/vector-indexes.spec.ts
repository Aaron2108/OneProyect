import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  buscarDropsSinRecrear,
  MIGRACIONES_HISTORICAS_EXENTAS,
  VECTOR_INDEXES,
} from '../../prisma/vector-indexes';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

/** Todas las migraciones del repo: nombre de carpeta -> SQL. */
function leerMigraciones(): Record<string, string> {
  const migraciones: Record<string, string> = {};
  for (const entrada of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const sql = join(MIGRATIONS_DIR, entrada.name, 'migration.sql');
    if (existsSync(sql)) migraciones[entrada.name] = readFileSync(sql, 'utf8');
  }
  return migraciones;
}

/**
 * Red de seguridad de los índices de pgvector.
 *
 * Prisma no ve los índices vectoriales y emite un `DROP INDEX` de cada uno en
 * CADA migración que genera. Aplicar ese SQL no da error: las búsquedas siguen
 * respondiendo, solo que escaneando la tabla entera. Ya pasó una vez y estuvo
 * dos días sin detectarse.
 *
 * Este test convierte ese descuido silencioso en un fallo ruidoso: si alguien
 * genera una migración y no revisa el SQL, la suite se cae aquí antes de que
 * llegue a producción.
 */
describe('índices vectoriales (pgvector)', () => {
  it('ninguna migración los borra sin volver a crearlos', () => {
    const hallazgos = buscarDropsSinRecrear(leerMigraciones());

    const detalle = hallazgos
      .map(
        (h) =>
          `  - ${h.migracion} borra "${h.indice}" y no lo recrea.\n` +
          `    Arréglalo quitando ese DROP INDEX del archivo: Prisma lo genera solo,\n` +
          `    porque no conoce los índices de pgvector. NO lo añadas a la lista de\n` +
          `    exentas.`,
      )
      .join('\n');

    expect(hallazgos.length === 0 ? '' : `\n${detalle}\n`).toBe('');
  });

  it('la lista de migraciones exentas no ha crecido', () => {
    // Es el incidente histórico, y una migración ya aplicada no se reescribe.
    // Si esta lista crece, alguien silenció el problema en vez de corregirlo.
    expect(MIGRACIONES_HISTORICAS_EXENTAS).toEqual(['20260723225015_business_profile']);
  });

  it('cada índice protegido se crea en alguna migración', () => {
    // Si el SQL de recuperación apunta a un índice que ya nadie crea, la
    // comprobación estaría vigilando algo que no existe.
    const todoElSql = Object.values(leerMigraciones()).join('\n');
    for (const { name } of VECTOR_INDEXES) {
      expect(todoElSql).toContain(`CREATE INDEX "${name}"`);
    }
  });

  describe('la detección en sí', () => {
    it('acepta borrar y recrear en la misma migración', () => {
      // Caso real: `embeddings_1024` los rehace al cambiar la dimensión.
      expect(
        buscarDropsSinRecrear({
          m1:
            'DROP INDEX IF EXISTS "knowledge_chunks_embedding_idx";\n' +
            'CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);',
        }),
      ).toEqual([]);
    });

    it('rechaza el borrado huérfano', () => {
      expect(
        buscarDropsSinRecrear({ m1: 'DROP INDEX "knowledge_chunks_embedding_idx";' }),
      ).toEqual([{ migracion: 'm1', indice: 'knowledge_chunks_embedding_idx' }]);
    });

    it('no le vale recrearlo ANTES de borrarlo', () => {
      expect(
        buscarDropsSinRecrear({
          m1:
            'CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);\n' +
            'DROP INDEX "knowledge_chunks_embedding_idx";',
        }),
      ).toHaveLength(1);
    });

    it('ignora los índices que no son vectoriales', () => {
      // Borrar un índice normal es una migración legítima y corriente.
      expect(buscarDropsSinRecrear({ m1: 'DROP INDEX "users_tenant_id_email_key";' })).toEqual([]);
    });

    it('no confunde la advertencia escrita en un comentario con el SQL', () => {
      // Las migraciones llevan un comentario explicando que se quitó el DROP;
      // sin ignorar comentarios, ese texto haría saltar la comprobación.
      expect(
        buscarDropsSinRecrear({
          m1: '-- Prisma generó aquí DROP INDEX "ai_context_memory_embedding_idx" y se quitó.\nALTER TABLE "x" ADD COLUMN "y" TEXT;',
        }),
      ).toEqual([]);
    });
  });
});
