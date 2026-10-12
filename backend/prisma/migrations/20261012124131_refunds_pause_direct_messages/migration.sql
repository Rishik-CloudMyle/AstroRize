-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WalletRefund" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL,
    "providerRef" TEXT,
    "processedById" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectThread" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMember" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "DirectMember_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletRefund_ref_key" ON "WalletRefund"("ref");

-- CreateIndex
CREATE INDEX "WalletRefund_status_createdAt_idx" ON "WalletRefund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMember_userId_idx" ON "DirectMember"("userId");

-- CreateIndex
CREATE INDEX "DirectMessage_threadId_createdAt_idx" ON "DirectMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletRefund" ADD CONSTRAINT "WalletRefund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMember" ADD CONSTRAINT "DirectMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMember" ADD CONSTRAINT "DirectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

