-- AlterTable
ALTER TABLE "WhatsappSettings" ADD COLUMN     "notifyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyRecipients" JSONB,
ADD COLUMN     "notifyTemplateName" TEXT;

-- CreateTable
CREATE TABLE "WhatsappNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappNotification_organizationId_status_idx" ON "WhatsappNotification"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappNotification_organizationId_leadId_recipient_key" ON "WhatsappNotification"("organizationId", "leadId", "recipient");

-- AddForeignKey
ALTER TABLE "WhatsappNotification" ADD CONSTRAINT "WhatsappNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappNotification" ADD CONSTRAINT "WhatsappNotification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
