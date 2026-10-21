-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachment" TEXT,
ADD COLUMN     "attachmentKind" TEXT;


-- The Lotus gift showed a diya (lamp) icon: give it a lotus.
UPDATE "Gift" SET "icon" = '🪷' WHERE "name" = 'Lotus' AND "icon" = '🪔';
