-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

