-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "LeadStatus" ADD VALUE 'QUOTATION';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "budget" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "leadId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedToId_idx" ON "Lead"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_projectId_idx" ON "Lead"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "LeadActivity_organizationId_createdAt_idx" ON "LeadActivity"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_leadId_idx" ON "Booking"("leadId");

-- CreateIndex
CREATE INDEX "SiteVisit_organizationId_status_date_idx" ON "SiteVisit"("organizationId", "status", "date");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_dueDate_idx" ON "Task"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Quotation_leadId_status_idx" ON "Quotation"("leadId", "status");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_createdAt_idx" ON "Quotation"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
