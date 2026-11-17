-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- RenameIndex
ALTER INDEX "WhatsAppConversation_organizationId_provider_providerContactId_" RENAME TO "WhatsAppConversation_organizationId_provider_providerContac_key";
