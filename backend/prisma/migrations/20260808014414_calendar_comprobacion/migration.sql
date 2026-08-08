-- AlterTable
ALTER TABLE "google_calendar_integrations" ADD COLUMN     "last_check_error" TEXT,
ADD COLUMN     "last_checked_at" TIMESTAMP(3);
