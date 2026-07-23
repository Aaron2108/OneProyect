-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "follow_up_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_follow_up_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "source" TEXT;
