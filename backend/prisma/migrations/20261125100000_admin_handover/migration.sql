-- CreateTable
CREATE TABLE "AdminHandover" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3),
    "previousRole" "AdminRole",
    "createdAccount" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AdminHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminHandover_userId_state_idx" ON "AdminHandover"("userId", "state");

-- AddForeignKey
ALTER TABLE "AdminHandover" ADD CONSTRAINT "AdminHandover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminHandover" ADD CONSTRAINT "AdminHandover_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

