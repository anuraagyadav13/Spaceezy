-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_CHANGE';

-- CreateTable
CREATE TABLE "LeadProjectInterest" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadProjectInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadProjectInterest_leadId_projectId_key" ON "LeadProjectInterest"("leadId", "projectId");

-- AddForeignKey
ALTER TABLE "LeadProjectInterest" ADD CONSTRAINT "LeadProjectInterest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProjectInterest" ADD CONSTRAINT "LeadProjectInterest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
