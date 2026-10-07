-- Phase 5: per-employee self-claim limit (null = claiming not configured)
ALTER TABLE "User" ADD COLUMN "selfClaimLimit" INTEGER;