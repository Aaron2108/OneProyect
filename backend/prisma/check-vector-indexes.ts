/**
 * Comprueba que los índices de pgvector siguen existiendo en la base.
 *
 *   npm run prisma:check-indexes            -> informa
 *   npm run prisma:check-indexes -- --repair -> los recrea
 *
 * El test de `tests/prisma/` vigila el SQL de las migraciones; esto vigila el
 * resultado. Hacen falta los dos: una migración correcta no garantiza que la
 * base esté bien si en algún momento se aplicó una que no lo era — que es
 * exactamente lo que pasó en julio de 2026 y tardó dos días en notarse.
 *
 * Se ejecuta solo después de `prisma migrate dev` (ver package.json), así que
 * el aviso llega en el momento en que se produce el daño y no semanas después.
 */
import { PrismaClient } from '@prisma/client';
import { VECTOR_INDEXES } from './vector-indexes';

const prisma = new PrismaClient();
const reparar = process.argv.includes('--repair');

async function main(): Promise<void> {
  const filas = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `;
  const existentes = new Set(filas.map((f) => f.indexname));
  const faltantes = VECTOR_INDEXES.filter((i) => !existentes.has(i.name));

  if (faltantes.length === 0) {
    console.log(`Índices vectoriales: ${VECTOR_INDEXES.length}/${VECTOR_INDEXES.length} presentes.`);
    return;
  }

  console.error(`\nFALTAN ${faltantes.length} índice(s) vectorial(es):\n`);
  for (const i of faltantes) {
    console.error(`  - ${i.name} (tabla ${i.table})`);
  }
  console.error(
    '\nLas búsquedas de la IA siguen respondiendo, pero recorriendo la tabla\n' +
      'entera en vez de usar el índice. Suele ser que una migración generada por\n' +
      'Prisma traía un DROP INDEX y se aplicó sin revisarla.\n',
  );

  if (!reparar) {
    console.error('Para recrearlos:  npm run prisma:check-indexes -- --repair\n');
    process.exitCode = 1;
    return;
  }

  for (const i of faltantes) {
    console.log(`Recreando ${i.name}…`);
    await prisma.$executeRawUnsafe(i.createSql);
  }
  console.log(`\nListo: ${faltantes.length} índice(s) recreado(s).`);
}

main()
  .catch((err) => {
    console.error(`No se pudo comprobar los índices: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
