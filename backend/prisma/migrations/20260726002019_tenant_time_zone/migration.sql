-- Zona horaria por negocio (antes era global, vía BUSINESS_TIME_ZONE).
--
-- ATENCIÓN: Prisma generó aquí de nuevo dos `DROP INDEX` de los índices HNSW de
-- pgvector (`ai_context_memory_embedding_idx` y `knowledge_chunks_embedding_idx`)
-- y se han quitado a mano. Su motor de diff no ve los índices vectoriales, así
-- que los da por sobrantes en CADA migración. Revisar siempre el SQL generado.

-- Nula a propósito: los negocios ya dados de alta siguen cayendo al valor de
-- BUSINESS_TIME_ZONE hasta que su propietario elija el suyo. Rellenarlo aquí
-- con una zona fija sería inventarle un huso a negocios que no lo declararon.
ALTER TABLE "tenants" ADD COLUMN     "time_zone" TEXT;
