-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "astrologerJoinedAt" TIMESTAMP(3),
ADD COLUMN     "billingStartedAt" TIMESTAMP(3),
ADD COLUMN     "customerJoinedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FreeCallUse" ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0;


-- Fill the new fields for past calls (only these new columns are written):
-- a call that already connected started billing when it connected, as it did then.
UPDATE "Consultation" SET "billingStartedAt" = "connectedAt" WHERE "connectedAt" IS NOT NULL AND "billingStartedAt" IS NULL;
-- Free calls already used count with the length they had.
UPDATE "FreeCallUse" f SET "minutes" = CEIL(c."complimentarySeconds" / 60.0)::int FROM "Consultation" c WHERE c."id" = f."consultationId" AND f."minutes" = 0;
