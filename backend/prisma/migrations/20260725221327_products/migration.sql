-- OJO: `prisma migrate dev` genera aquí dos `DROP INDEX` de los índices HNSW de
-- pgvector (`ai_context_memory_embedding_idx`, `knowledge_chunks_embedding_idx`)
-- y se han quitado a mano. Prisma no representa los índices de pgvector —se
-- crean con SQL crudo—, así que su motor de diferencias los considera sobrantes
-- e intenta borrarlos en CADA migración. Ya ocurrió una vez sin que nadie lo
-- notara (migración `business_profile`): las búsquedas por similitud pasaron a
-- escaneo secuencial hasta que se restableció en `embeddings_1024`.
-- Revisar esto en toda migración nueva.

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER,
    "currency" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_tenant_id_active_idx" ON "products"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
