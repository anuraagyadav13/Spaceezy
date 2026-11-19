-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "junkReason" TEXT,
ADD COLUMN     "junkedAt" TIMESTAMP(3),
ADD COLUMN     "junkedBy" TEXT,
ADD COLUMN     "originalProjectId" TEXT,
ADD COLUMN     "purgeAfter" TIMESTAMP(3),
ADD COLUMN     "purgeBlockedReason" TEXT,
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredBy" TEXT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_junkedBy_fkey" FOREIGN KEY ("junkedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_restoredBy_fkey" FOREIGN KEY ("restoredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_originalProjectId_fkey" FOREIGN KEY ("originalProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
