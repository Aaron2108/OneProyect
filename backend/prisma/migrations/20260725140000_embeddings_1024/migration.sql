-- Búsqueda semántica real: se pasa de vector(512) a vector(1024).
--
-- Motivo: hasta ahora el único proveedor de embeddings en uso era el simulado,
-- que ordena por frecuencia de caracteres y no por significado (medido: ponía
-- el fragmento correcto en último lugar). 1024 es la dimensión de
-- `nv-embedqa-e5-v5` (NVIDIA) y de `voyage-3`, así que sirve para el proveedor
-- de pruebas actual y para el destino de producción sin volver a migrar.
--
-- Los vectores de 512 no se pueden convertir a 1024: se anulan y se regeneran
-- con `npm run embeddings:reindex`, que re-vectoriza el texto de cada fragmento
-- ya guardado (no vuelve a fragmentar: los fragmentos se solapan y re-partirlos
-- duplicaría contenido).

-- La columna pasa a aceptar NULL: un fragmento puede existir sin vector
-- mientras espera reindexado, y el texto pendiente de revisión (posición -1) ya
-- no necesita el vector de ceros que se usaba solo para satisfacer NOT NULL.

-- knowledge_chunks
DROP INDEX IF EXISTS "knowledge_chunks_embedding_idx";
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" DROP NOT NULL;
UPDATE "knowledge_chunks" SET "embedding" = NULL;
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" TYPE vector(1024) USING NULL;
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- ai_context_memory
-- El índice HNSW de esta tabla lo borró la migración `business_profile`
-- (Prisma no conoce los índices de pgvector, creados con SQL crudo) y nunca se
-- recreó: desde entonces la memoria de contexto se buscaba con escaneo
-- secuencial. Se restablece aquí.
DROP INDEX IF EXISTS "ai_context_memory_embedding_idx";
ALTER TABLE "ai_context_memory" ALTER COLUMN "embedding" DROP NOT NULL;
UPDATE "ai_context_memory" SET "embedding" = NULL;
ALTER TABLE "ai_context_memory" ALTER COLUMN "embedding" TYPE vector(1024) USING NULL;
CREATE INDEX "ai_context_memory_embedding_idx" ON "ai_context_memory" USING hnsw ("embedding" vector_cosine_ops);
