-- Resumen de la conversacion para el equipo (distinto de la memoria de la IA).
--
-- Prisma genero aqui los DROP INDEX de los dos indices HNSW de pgvector; se
-- quitaron a mano, avisados por tests/prisma/vector-indexes.spec.ts.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summary_at" TIMESTAMP(3);
