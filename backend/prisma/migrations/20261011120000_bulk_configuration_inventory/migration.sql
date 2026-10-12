-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "areaMax" INTEGER,
ADD COLUMN     "areaMin" INTEGER,
ADD COLUMN     "availableUnits" INTEGER,
ADD COLUMN     "inventoryVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priceMax" DECIMAL(12,2),
ADD COLUMN     "priceMin" DECIMAL(12,2),
ADD COLUMN     "totalUnits" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "configurationId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_organizationId_configurationId_idx" ON "Lead"("organizationId", "configurationId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
