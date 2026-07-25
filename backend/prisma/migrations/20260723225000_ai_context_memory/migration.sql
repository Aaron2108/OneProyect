-- Fase 4: memoria de contexto de la IA (ver docs/DECISIONS.md, 2026-07-23).
-- Escrita a mano (igual que otras migraciones de este proyecto que tocan tipos
-- que Prisma no modela) porque el tipo `vector` requiere la extensión pgvector
-- ya instalada antes de poder crear la columna.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ai_context_memory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "content" TEXT NOT NULL,
    "embedding" vector(512) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_context_memory_tenant_id_contact_id_idx" ON "ai_context_memory"("tenant_id", "contact_id");

-- Índice HNSW para similitud coseno (aproximado, no necesita datos previos
-- para construirse a diferencia de ivfflat).
CREATE INDEX "ai_context_memory_embedding_idx" ON "ai_context_memory" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "ai_context_memory" ADD CONSTRAINT "ai_context_memory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_memory" ADD CONSTRAINT "ai_context_memory_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
