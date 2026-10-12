-- AlterTable
ALTER TABLE "MessageThread" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_astrologerId_customerId_key" ON "MessageThread"("astrologerId", "customerId");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

