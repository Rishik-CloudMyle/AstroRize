-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "chatPrice" INTEGER,
ADD COLUMN     "chatPriceChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FreeCallUse" ADD COLUMN     "bonusMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PriceChange" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'CALL';

-- AlterTable
ALTER TABLE "WelcomeBenefit" ADD COLUMN     "bonusMinutes" INTEGER NOT NULL DEFAULT 0;
