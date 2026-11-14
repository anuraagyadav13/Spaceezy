-- Credential management: Meta App ID + webhook verify token (additive only).
-- metaAppId is public OAuth metadata (it appears in authorize URLs), stored
-- plain exactly like WhatsappSettings.appId. The webhook verify token is a
-- secret and lives only as an AES-256-GCM envelope (META_ADS_SETTINGS_KEY).
-- No columns are altered or dropped.

-- AlterTable
ALTER TABLE "MetaAdsSettings" ADD COLUMN     "metaAppId" TEXT,
ADD COLUMN     "webhookVerifyTokenEnc" TEXT;
