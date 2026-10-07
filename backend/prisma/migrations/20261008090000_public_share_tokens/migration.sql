-- Public share tokens + publication flags (additive, reversible)
ALTER TABLE "Property" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "Property" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Property_publicToken_key" ON "Property"("publicToken");

ALTER TABLE "Project" ADD COLUMN "publicSlug" TEXT;
ALTER TABLE "Project" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Project_publicSlug_key" ON "Project"("publicSlug");
