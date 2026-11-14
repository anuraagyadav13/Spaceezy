-- Phase 2 (Meta Instant Forms & lead sync) — additive only:
--   * Lead.metaAnswers          — structured JSON snapshot of every Meta
--                                 question/answer (original labels preserved;
--                                 unmapped answers never go into `message`).
--   * MetaLeadFormConfig        — per-form sync enable/disable + saved field
--                                 mapping (unique per org+form; no credentials).
--   * MetaLeadSyncRun           — sync run history with accurate counts.
--   * MetaLeadSyncEvent         — per-lead idempotent sync event log (2I).
-- No existing column, constraint or index is altered or dropped.
-- Generated with: prisma migrate diff --from-schema <pre-phase2> --to-schema prisma/schema.prisma --script

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "metaAnswers" JSONB;

-- CreateTable
CREATE TABLE "MetaLeadFormConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formName" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fieldMapping" JSONB NOT NULL DEFAULT '[]',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadFormConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaLeadSyncRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaLeadSyncEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metaLeadId" TEXT,
    "pageId" TEXT,
    "formId" TEXT,
    "leadId" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "errorCode" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MetaLeadSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaLeadFormConfig_organizationId_pageId_idx" ON "MetaLeadFormConfig"("organizationId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadFormConfig_organizationId_formId_key" ON "MetaLeadFormConfig"("organizationId", "formId");

-- CreateIndex
CREATE INDEX "MetaLeadSyncRun_organizationId_startedAt_idx" ON "MetaLeadSyncRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "MetaLeadSyncRun_organizationId_formId_idx" ON "MetaLeadSyncRun"("organizationId", "formId");

-- CreateIndex
CREATE INDEX "MetaLeadSyncEvent_organizationId_status_idx" ON "MetaLeadSyncEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MetaLeadSyncEvent_organizationId_formId_idx" ON "MetaLeadSyncEvent"("organizationId", "formId");

-- CreateIndex
CREATE INDEX "MetaLeadSyncEvent_organizationId_createdAt_idx" ON "MetaLeadSyncEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadSyncEvent_organizationId_idempotencyKey_key" ON "MetaLeadSyncEvent"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "MetaLeadFormConfig" ADD CONSTRAINT "MetaLeadFormConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadSyncRun" ADD CONSTRAINT "MetaLeadSyncRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadSyncEvent" ADD CONSTRAINT "MetaLeadSyncEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaLeadSyncEvent" ADD CONSTRAINT "MetaLeadSyncEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MetaLeadSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
