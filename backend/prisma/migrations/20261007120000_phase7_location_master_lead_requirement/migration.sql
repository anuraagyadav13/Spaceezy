-- Phase 7: canonical location hierarchy + lead requirement fields (additive only)

-- CreateTable: canonical location master (system-wide, read-only for CRM users)
CREATE TABLE "LocationState" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationDistrict" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationDistrict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationRegion" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one row per preferred location on a lead
CREATE TABLE "LeadPreferredLocation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "districtId" TEXT,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPreferredLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationState_code_key" ON "LocationState"("code");
CREATE UNIQUE INDEX "LocationState_name_key" ON "LocationState"("name");
CREATE INDEX "LocationState_name_idx" ON "LocationState"("name");

CREATE UNIQUE INDEX "LocationDistrict_stateId_name_key" ON "LocationDistrict"("stateId", "name");
CREATE INDEX "LocationDistrict_stateId_idx" ON "LocationDistrict"("stateId");

CREATE UNIQUE INDEX "LocationRegion_districtId_name_key" ON "LocationRegion"("districtId", "name");
CREATE INDEX "LocationRegion_districtId_idx" ON "LocationRegion"("districtId");

CREATE INDEX "LeadPreferredLocation_leadId_idx" ON "LeadPreferredLocation"("leadId");
CREATE INDEX "LeadPreferredLocation_stateId_idx" ON "LeadPreferredLocation"("stateId");
CREATE INDEX "LeadPreferredLocation_districtId_idx" ON "LeadPreferredLocation"("districtId");
CREATE INDEX "LeadPreferredLocation_regionId_idx" ON "LeadPreferredLocation"("regionId");

-- AddForeignKey
ALTER TABLE "LocationDistrict" ADD CONSTRAINT "LocationDistrict_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "LocationState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LocationRegion" ADD CONSTRAINT "LocationRegion_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "LocationDistrict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadPreferredLocation" ADD CONSTRAINT "LeadPreferredLocation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadPreferredLocation" ADD CONSTRAINT "LeadPreferredLocation_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "LocationState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadPreferredLocation" ADD CONSTRAINT "LeadPreferredLocation_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "LocationDistrict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadPreferredLocation" ADD CONSTRAINT "LeadPreferredLocation_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "LocationRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lead requirement fields (customer requirement, distinct from project/property refs)
ALTER TABLE "Lead" ADD COLUMN "budgetMin" DECIMAL(14,2);
ALTER TABLE "Lead" ADD COLUMN "budgetMax" DECIMAL(14,2);
ALTER TABLE "Lead" ADD COLUMN "propertyType" TEXT;
ALTER TABLE "Lead" ADD COLUMN "configurations" TEXT[];

-- Project canonical location FKs (legacy free-text columns preserved above)
ALTER TABLE "Project" ADD COLUMN "stateId" TEXT;
ALTER TABLE "Project" ADD COLUMN "districtId" TEXT;
ALTER TABLE "Project" ADD COLUMN "regionId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "LocationState"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "LocationDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "LocationRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
