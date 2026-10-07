-- AlterTable
ALTER TABLE "SiteVisit" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "SiteVisit_projectId_idx" ON "SiteVisit"("projectId");

-- CreateIndex
CREATE INDEX "SiteVisit_propertyId_idx" ON "SiteVisit"("propertyId");

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;