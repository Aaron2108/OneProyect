import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeDocumentStatus } from '@prisma/client';
import { EmbeddingsService } from '../ai/embeddings.service';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { KNOWLEDGE_TOP_K } from './knowledge.constants';

interface ChunkRow {
  content: string;
  filename: string;
}

/** Fragmento recuperado, con el documento del que salió (para citar la fuente). */
export interface RecalledChunk {
  text: string;
  source: string;
}

/**
 * Recupera del conocimiento del negocio solo los fragmentos relevantes a lo que
 * pregunta el cliente.
 *
 * **Por qué recuperación y no inyectar los documentos completos**: el system
 * prompt se paga en CADA mensaje de WhatsApp. Meter 20 páginas de PDF en cada
 * respuesta multiplicaría el costo por conversación y dejaría corta la guarda de
 * costo de `AiService`. Recuperar 3-4 fragmentos mantiene el costo acotado.
 *
 * Aislamiento: la consulta filtra siempre por `tenantId` y solo mira documentos
 * en estado ACTIVE (revisados por el dueño). Nunca cruza tenants, mismo
 * principio transversal que el resto del producto.
 *
 * `embedding` es `Unsupported("vector(1024)")` en el esquema, así que esta clase
 * es la única que la toca, siempre con SQL parametrizado ($queryRaw) — nunca
 * interpolando strings.
 */
@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly pii: PiiCryptoService,
  ) {}

  /** Sin proveedor de embeddings configurado, el conocimiento queda deshabilitado. */
  isEnabled(): boolean {
    return this.embeddings.isEnabled();
  }

  /**
   * Fragmentos más relevantes para `queryText` dentro del tenant.
   * Best-effort: nunca lanza — si falla, la IA responde sin este contexto en vez
   * de dejar al cliente sin respuesta.
   */
  async recall(
    tenantId: string,
    queryText: string,
    topK: number = KNOWLEDGE_TOP_K,
  ): Promise<RecalledChunk[]> {
    if (!this.isEnabled() || !queryText.trim()) return [];
    try {
      const embedding = await this.embeddings.embed(queryText, 'query');
      const literal = toVectorLiteral(embedding);
      const rows = await this.prisma.$queryRaw<ChunkRow[]>`
        SELECT c.content, d.filename
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.tenant_id = ${tenantId}
          AND d.status = ${KnowledgeDocumentStatus.ACTIVE}::"KnowledgeDocumentStatus"
          -- Sin vector no hay distancia que ordenar: son fragmentos pendientes
          -- de reindexar, y devolverlos daría contexto elegido al azar.
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${literal}::vector
        LIMIT ${topK}
      `;
      return rows.map((row) => ({
        text: this.pii.decrypt(row.content),
        source: row.filename,
      }));
    } catch (err) {
      this.logger.error(
        `No se pudo recuperar conocimiento del negocio (tenant ${tenantId}): ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Líneas listas para el system prompt, o vacío si el negocio no tiene
   * documentos relevantes. `AiService.buildSystemPrompt` las añade tal cual,
   * igual que hace con el perfil del negocio y los recuerdos del contacto.
   */
  async describe(tenantId: string, queryText: string): Promise<string[]> {
    const chunks = await this.recall(tenantId, queryText);
    if (chunks.length === 0) return [];
    return [
      'Extractos de la documentación que el negocio subió, relevantes para este mensaje. ' +
        'Úsalos como fuente de verdad; si la respuesta no está aquí ni en el resto de tu ' +
        'contexto, dilo con claridad en vez de suponerla:',
      ...chunks.map((chunk) => `- (${chunk.source}) ${chunk.text}`),
    ];
  }
}

/** pgvector acepta la representación de texto `[v1,v2,...]` casteada con `::vector`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
