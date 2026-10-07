-- Lead.configurations must never be NULL: default existing rows, set default + NOT NULL
UPDATE "Lead" SET "configurations" = ARRAY[]::TEXT[] WHERE "configurations" IS NULL;

ALTER TABLE "Lead" ALTER COLUMN "configurations" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Lead" ALTER COLUMN "configurations" SET NOT NULL;
