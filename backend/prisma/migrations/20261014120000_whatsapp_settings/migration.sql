-- CreateTable
CREATE TABLE "WhatsappSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "graphVersion" TEXT NOT NULL DEFAULT 'v21.0',
    "providerMode" TEXT NOT NULL DEFAULT 'mock',
    "accessTokenEnc" TEXT,
    "appSecretEnc" TEXT,
    "verifyTokenEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSettings_organizationId_key" ON "WhatsappSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSettings_phoneNumberId_key" ON "WhatsappSettings"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsappSettings_organizationId_idx" ON "WhatsappSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "WhatsappSettings" ADD CONSTRAINT "WhatsappSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
