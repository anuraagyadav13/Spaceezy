-- Alter Table
ALTER TABLE "Property" ADD COLUMN     "configurationId" TEXT,
ADD COLUMN     "tower" TEXT;

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bhk" INTEGER,
    "areaSaleable" INTEGER,
    "basePrice" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Configuration_organizationId_projectId_idx" ON "Configuration"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_projectId_name_key" ON "Configuration"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Property_projectId_unitNumber_key" ON "Property"("projectId", "unitNumber");

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
