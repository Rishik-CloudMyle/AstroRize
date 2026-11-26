-- Manual payouts (bank transfer recorded by Finance) beside automatic providers.
ALTER TABLE "Payout" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Payout" ADD COLUMN "exportRef" TEXT;
ALTER TABLE "Payout" ADD COLUMN "exportedAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "markedByName" TEXT;

-- Payouts made before this were RazorpayX's (or its simulation's).
UPDATE "Payout" SET "provider" = 'razorpayx';
UPDATE "Payout" SET "paidAt" = "updatedAt" WHERE "state" = 'PROCESSED';
