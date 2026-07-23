import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

/** Cuántos recuerdos pasados como máximo se recuperan para una respuesta. */
const DEFAULT_TOP_K = 3;

interface MemoryRow {
  content: string;
}

/**
 * Memoria de contexto entre conversaciones, por contacto (Fase 4, ver
 * docs/DECISIONS.md 2026-07-23). Guarda resúmenes con su embedding y recupera
 * los más similares al mensaje actual — siempre acotado a un `tenantId` y
 * `contactId` concretos (nunca cruza tenants ni contactos, mismo principio de
 * seguridad transversal que el resto del producto).
 *
 * La columna `embedding` es `Unsupported("vector(512)")` en el esquema de
 * Prisma (no representable en el Client), así que esta clase es la única que
 * la toca, siempre con SQL parametrizado ($executeRaw/$queryRaw — nunca
 * interpolación de strings).
 */
@Injectable()
export class AiContextMemoryService {
  private readonly logger = new Logger(AiContextMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly pii: PiiCryptoService,
  ) {}

  /** Sin proveedor de embeddings configurado, la memoria de contexto queda deshabilitada. */
  isEnabled(): boolean {
    return this.embeddings.isEnabled();
  }

  /** Guarda un recuerdo (p. ej. el resumen de una conversación recién cerrada). Best-effort: nunca lanza. */
  async remember(
    tenantId: string,
    contactId: string,
    conversationId: string | null,
    text: string,
  ): Promise<void> {
    if (!this.isEnabled() || !text.trim()) return;
    try {
      const embedding = await this.embeddings.embed(text);
      const id = randomUUID();
      const encrypted = this.pii.encrypt(text);
      await this.prisma.$executeRaw`
        INSERT INTO ai_context_memory (id, tenant_id, contact_id, conversation_id, content, embedding, created_at)
        VALUES (${id}, ${tenantId}, ${contactId}, ${conversationId}, ${encrypted}, ${toVectorLiteral(embedding)}::vector, now())
      `;
    } catch (err) {
      this.logger.error(`No se pudo guardar memoria de contexto (contacto ${contactId}): ${(err as Error).message}`);
    }
  }

  /** Recupera los recuerdos más relevantes de un contacto para el texto dado. Best-effort: nunca lanza. */
  async recall(
    tenantId: string,
    contactId: string,
    queryText: string,
    topK: number = DEFAULT_TOP_K,
  ): Promise<string[]> {
    if (!this.isEnabled() || !queryText.trim()) return [];
    try {
      const embedding = await this.embeddings.embed(queryText);
      const literal = toVectorLiteral(embedding);
      const rows = await this.prisma.$queryRaw<MemoryRow[]>`
        SELECT content FROM ai_context_memory
        WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${topK}
      `;
      return rows.map((r) => this.pii.decrypt(r.content));
    } catch (err) {
      this.logger.error(`No se pudo recuperar memoria de contexto (contacto ${contactId}): ${(err as Error).message}`);
      return [];
    }
  }
}

/** pgvector acepta la representación de texto `[v1,v2,...]` casteada con `::vector`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
