-- Temporary blocks for repeated off-platform contact sharing (client, Nov 2026). Additive only:
-- null = not blocked; existing rows are unchanged.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedUntil" TIMESTAMP(3),
ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "suspendedUntil" TIMESTAMP(3);
