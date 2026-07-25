/**
 * Regenera los embeddings de la documentación del negocio y de la memoria de
 * contexto. Hace falta después de la migración `embeddings_1024`, que anuló los
 * vectores de 512 dimensiones porque no se pueden convertir a 1024.
 *
 * **Re-vectoriza, no vuelve a fragmentar.** Cada fila conserva su texto: se le
 * calcula el vector nuevo y se actualiza en su sitio. Volver a partir el
 * documento no serviría —los fragmentos se solapan, así que reconstruir el texto
 * desde ellos duplicaría contenido— y además perdería el trabajo de revisión.
 *
 * Idempotente: solo toca las filas SIN vector, así que se puede correr más de
 * una vez y se puede retomar si se interrumpe a mitad.
 *
 * Uso: npm run embeddings:reindex
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { EmbeddingsService } from '../src/ai/embeddings.service';
import { PiiCryptoService } from '../src/common/pii-crypto.service';

/** Lee la configuración real de la app sin levantar todo Nest. */
function makeConfig(): ConfigService {
  const values = configuration() as unknown as Record<string, unknown>;
  return {
    get: (key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (obj, part) => (obj as Record<string, unknown> | undefined)?.[part],
          values,
        ),
  } as unknown as ConfigService;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function main(): Promise<void> {
  const config = makeConfig();
  const embeddings = new EmbeddingsService(config);
  const pii = new PiiCryptoService(config);
  const prisma = new PrismaClient();

  const provider = config.get<string>('embeddings.provider');
  if (!embeddings.isEnabled()) {
    throw new Error(
      `El proveedor de embeddings "${provider}" no tiene credenciales: revisá EMBEDDINGS_PROVIDER y EMBEDDINGS_API_KEY.`,
    );
  }
  if (provider === 'mock') {
    // Reindexar con el proveedor simulado dejaría vectores que no representan
    // significado, y la búsqueda seguiría eligiendo mal sin que se note.
    throw new Error(
      'EMBEDDINGS_PROVIDER=mock no genera búsqueda semántica real. Configurá un proveedor real antes de reindexar.',
    );
  }

  try {
    // --- Fragmentos de documentación -----------------------------------------
    // La posición -1 es el texto completo pendiente de revisión: no se indexa.
    const chunks = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT id, content FROM knowledge_chunks
      WHERE embedding IS NULL AND position >= 0
      ORDER BY document_id, position
    `;
    console.log(`Fragmentos de documentación por reindexar: ${chunks.length}`);

    let hechos = 0;
    for (const chunk of chunks) {
      const vector = await embeddings.embed(pii.decrypt(chunk.content), 'passage');
      await prisma.$executeRaw`
        UPDATE knowledge_chunks SET embedding = ${toVectorLiteral(vector)}::vector
        WHERE id = ${chunk.id}
      `;
      hechos++;
      if (hechos % 10 === 0) console.log(`  ${hechos}/${chunks.length}`);
    }
    console.log(`  ${hechos}/${chunks.length} — listo`);

    // --- Memoria de contexto --------------------------------------------------
    const memories = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT id, content FROM ai_context_memory WHERE embedding IS NULL
    `;
    console.log(`Recuerdos de contexto por reindexar: ${memories.length}`);

    let memoriasHechas = 0;
    for (const memory of memories) {
      const vector = await embeddings.embed(pii.decrypt(memory.content), 'passage');
      await prisma.$executeRaw`
        UPDATE ai_context_memory SET embedding = ${toVectorLiteral(vector)}::vector
        WHERE id = ${memory.id}
      `;
      memoriasHechas++;
    }
    console.log(`  ${memoriasHechas}/${memories.length} — listo`);

    // Un documento ACTIVE sin ningún fragmento indexado respondería como si no
    // tuviera contenido: conviene que se vea, no que falle en silencio.
    const huerfanos = await prisma.$queryRaw<Array<{ filename: string }>>`
      SELECT d.filename FROM knowledge_documents d
      WHERE d.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM knowledge_chunks c
          WHERE c.document_id = d.id AND c.position >= 0 AND c.embedding IS NOT NULL
        )
    `;
    if (huerfanos.length > 0) {
      console.warn(
        `\nAVISO: ${huerfanos.length} documento(s) activo(s) siguen sin fragmentos indexados ` +
          `(${huerfanos.map((d) => d.filename).join(', ')}). Volvé a activarlos desde el panel.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FALLÓ el reindexado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
