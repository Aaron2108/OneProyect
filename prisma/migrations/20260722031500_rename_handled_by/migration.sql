-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "handledBy",
ADD COLUMN     "handled_by" "ConversationHandler" NOT NULL DEFAULT 'AI';

