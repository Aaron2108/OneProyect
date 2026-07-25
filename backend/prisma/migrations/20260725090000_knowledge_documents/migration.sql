-- Fase 4: documentos de conocimiento del negocio para la IA (PDF/Word/texto).
-- Escrita a mano, igual que la migración de `ai_context_memory`, porque el tipo
-- `vector` de pgvector no lo modela Prisma Client.
--
-- A diferencia de `ai_context_memory` (memoria por contacto), este conocimiento
-- es del tenant y aplica a cualquier conversación: de ahí una tabla propia en
-- vez de hacer `contact_id` opcional en la otra.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('EXTRACTING', 'PENDING_REVIEW', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeExtractionMethod" AS ENUM ('TEXT_LAYER', 'VISION');

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'EXTRACTING',
    "extraction_method" "KnowledgeExtractionMethod",
    "page_count" INTEGER,
    "char_count" INTEGER,
    "vision_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "extraction_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(512) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_status_idx" ON "knowledge_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_chunks_tenant_id_idx" ON "knowledge_chunks"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks"("document_id");

-- Índice HNSW para similitud coseno (aproximado; no necesita datos previos para
-- construirse, a diferencia de ivfflat).
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
