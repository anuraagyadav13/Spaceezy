-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "metaAdId" TEXT,
ADD COLUMN     "metaAdsetId" TEXT,
ADD COLUMN     "metaCampaignId" TEXT,
ADD COLUMN     "metaCampaignName" TEXT,
ADD COLUMN     "metaCreatedAt" TIMESTAMP(3),
ADD COLUMN     "metaFormId" TEXT,
ADD COLUMN     "metaLeadId" TEXT,
ADD COLUMN     "metaPageId" TEXT,
ADD COLUMN     "metaPlatform" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_metaLeadId_key" ON "Lead"("organizationId", "metaLeadId");
