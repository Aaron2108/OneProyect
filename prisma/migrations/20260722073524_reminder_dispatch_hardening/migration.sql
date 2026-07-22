-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "next_attempt_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reminders_status_next_attempt_at_idx" ON "reminders"("status", "next_attempt_at");

