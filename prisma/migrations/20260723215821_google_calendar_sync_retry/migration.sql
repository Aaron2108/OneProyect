-- CreateTable
CREATE TABLE "google_calendar_sync_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_sync_jobs_appointment_id_key" ON "google_calendar_sync_jobs"("appointment_id");

-- CreateIndex
CREATE INDEX "google_calendar_sync_jobs_next_attempt_at_idx" ON "google_calendar_sync_jobs"("next_attempt_at");

-- AddForeignKey
ALTER TABLE "google_calendar_sync_jobs" ADD CONSTRAINT "google_calendar_sync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_sync_jobs" ADD CONSTRAINT "google_calendar_sync_jobs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
