-- Phase 1: company-level Meta Ads settings (additive only).
-- SpaceEzy is a single-company CRM: exactly one row for the primary
-- organization (unique organizationId), mirroring WhatsappSettings.
-- Secrets are stored only as AES-256-GCM envelopes (accessTokenEnc /
-- appSecretEnc) — never plaintext tokens in JSON columns.

-- CreateTable
CREATE TABLE "MetaAdsSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "appSecretEnc" TEXT,
    "selectedAdAccountIds" JSONB NOT NULL DEFAULT '[]',
    "pageIds" JSONB NOT NULL DEFAULT '[]',
    "instagramAccountIds" JSONB NOT NULL DEFAULT '[]',
    "graphVersion" TEXT NOT NULL DEFAULT 'v22.0',
    "tokenExpiresAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdsSettings_organizationId_key" ON "MetaAdsSettings"("organizationId");

-- CreateIndex
CREATE INDEX "MetaAdsSettings_organizationId_idx" ON "MetaAdsSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "MetaAdsSettings" ADD CONSTRAINT "MetaAdsSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
