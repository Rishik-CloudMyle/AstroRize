-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'MARKETING';

-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "gender" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "birthTime" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "LiveAnnouncement" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveAnnouncement_roomId_createdAt_idx" ON "LiveAnnouncement"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "LiveAnnouncement" ADD CONSTRAINT "LiveAnnouncement_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
