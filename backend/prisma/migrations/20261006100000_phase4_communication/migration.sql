-- Phase 4: Unified communication system (additive only)

-- ActivityType: new timeline event types
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'QUOTATION';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'BOOKING';

-- CallOutcome enum
CREATE TYPE "CallOutcome" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'CALL_BACK', 'FOLLOW_UP_REQUIRED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'SITE_VISIT_INTERESTED', 'QUOTATION_INTERESTED', 'OTHER');

-- TaskPriority enum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Task additions
ALTER TABLE "Task" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "rescheduledAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "rescheduleReason" TEXT;
ALTER TABLE "Task" ADD COLUMN "sourceCallId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceCallId_fkey" FOREIGN KEY ("sourceCallId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_organizationId_assignedToId_status_dueDate_idx" ON "Task"("organizationId", "assignedToId", "status", "dueDate");

-- Call additions
ALTER TABLE "Call" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Call" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Call" ADD COLUMN "disposition" "CallOutcome";
ALTER TABLE "Call" ADD COLUMN "notes" TEXT;
ALTER TABLE "Call" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Call" ADD COLUMN "endedAt" TIMESTAMP(3);

ALTER TABLE "Call" ADD CONSTRAINT "Call_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Call_organizationId_leadId_createdAt_idx" ON "Call"("organizationId", "leadId", "createdAt");
CREATE INDEX "Call_organizationId_userId_createdAt_idx" ON "Call"("organizationId", "userId", "createdAt");

-- WhatsApp enums
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- WhatsAppConversation
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'none',
    "providerContactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppConversation_organizationId_lastMessageAt_idx" ON "WhatsAppConversation"("organizationId", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_organizationId_leadId_idx" ON "WhatsAppConversation"("organizationId", "leadId");

CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_provider_providerContactId_key" ON "WhatsAppConversation"("organizationId", "provider", "providerContactId");

ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WhatsAppMessage
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "body" TEXT NOT NULL,
    "templateName" TEXT,
    "variables" JSONB,
    "providerMessageId" TEXT,
    "sentById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppMessage_organizationId_createdAt_idx" ON "WhatsAppMessage"("organizationId", "createdAt");
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");
CREATE INDEX "WhatsAppMessage_leadId_createdAt_idx" ON "WhatsAppMessage"("leadId", "createdAt");

CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_providerMessageId_key" ON "WhatsAppMessage"("organizationId", "providerMessageId");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WhatsAppTemplate
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "variables" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppTemplate_organizationId_active_idx" ON "WhatsAppTemplate"("organizationId", "active");
CREATE UNIQUE INDEX "WhatsAppTemplate_organizationId_name_key" ON "WhatsAppTemplate"("organizationId", "name");

ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_organizationId_action_idx" ON "AuditLog"("organizationId", "action");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
