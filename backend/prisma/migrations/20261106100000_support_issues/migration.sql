-- Customer Help & support (Nov 2026): issues raised from the customer's account, routed between
-- teams, with a customer-visible conversation and staff-only internal notes. Additive only: existing
-- tickets get assignedTeam 'support' (where they already are) and nulls/false elsewhere.
-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "assignedTeam" TEXT NOT NULL DEFAULT 'support',
ADD COLUMN     "awaitingCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "closedAs" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerReadAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "team" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "attachment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket"("customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedTeam_idx" ON "SupportTicket"("assignedTeam");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

