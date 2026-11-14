-- Step 0: Meta attribution reporting indexes (additive only).
-- Organization-scoped lookups used by reporting joins and attribution views.
-- The existing unique dedupe index Lead_organizationId_metaLeadId_key is
-- untouched. No columns are altered or dropped.

-- CreateIndex
CREATE INDEX "Lead_organizationId_metaAdId_idx" ON "Lead"("organizationId", "metaAdId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_metaCampaignId_idx" ON "Lead"("organizationId", "metaCampaignId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_metaFormId_idx" ON "Lead"("organizationId", "metaFormId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_metaPageId_idx" ON "Lead"("organizationId", "metaPageId");
