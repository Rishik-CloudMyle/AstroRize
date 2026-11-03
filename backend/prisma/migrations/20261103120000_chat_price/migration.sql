-- Paid chat is back with its own optional per-minute price (client, Nov 2026). Additive only:
-- null chatPrice = chat costs the call price; null channel = a change of the call price.

-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "chatPrice" INTEGER,
ADD COLUMN     "chatPriceChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PriceChange" ADD COLUMN     "channel" TEXT;
