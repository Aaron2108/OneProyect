-- Búsqueda de productos insensible a tildes y tolerante a erratas.
--
-- ATENCIÓN: Prisma generó aquí dos `DROP INDEX` de los índices HNSW de pgvector
-- (`ai_context_memory_embedding_idx` y `knowledge_chunks_embedding_idx`) y se
-- han quitado a mano. Su motor de diff no ve los índices vectoriales, así que
-- los da por sobrantes y los borra en CADA migración que se genere. Revisar
-- siempre el SQL antes de aplicarlo.

-- `pg_trgm` es dependencia de ejecución: da el índice de trigramas y los
-- operadores de similitud que toleran las erratas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '';

-- Relleno de los productos ya cargados. `unaccent` se usa SOLO aquí, una vez:
-- en marcha, quien normaliza es `ProductsService` en cada escritura. Su tabla
-- de reglas coincide con la normalización NFD de la aplicación (incluido ñ→n).
CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE "products"
SET "search_text" = lower(unaccent(
  coalesce("name", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("description", '')
));

-- CreateIndex
CREATE INDEX "products_search_text_idx" ON "products" USING GIN ("search_text" gin_trgm_ops);
