-- CreateEnum
CREATE TYPE "WhatsappProviderKind" AS ENUM ('EVOLUTION', 'META');

-- CreateEnum
CREATE TYPE "WhatsappConnectionStatus" AS ENUM ('DISCONNECTED', 'QR_PENDING', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "WhatsappProviderKind" NOT NULL DEFAULT 'EVOLUTION',
    "external_id" TEXT NOT NULL,
    "status" "WhatsappConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "phone_number" TEXT,
    "credential" TEXT,
    "qr_code" TEXT,
    "qr_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3),
    "last_status_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_tenant_id_key" ON "whatsapp_instances"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_external_id_key" ON "whatsapp_instances"("external_id");

-- AddForeignKey
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
