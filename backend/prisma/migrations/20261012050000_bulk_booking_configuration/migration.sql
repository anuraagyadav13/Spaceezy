-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "configurationId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_organizationId_configurationId_idx" ON "Booking"("organizationId", "configurationId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
