-- CreateTable
CREATE TABLE "AstrologerIssue" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "AstrologerIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerIssueMessage" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstrologerIssueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AstrologerIssue_astrologerId_idx" ON "AstrologerIssue"("astrologerId");

-- CreateIndex
CREATE INDEX "AstrologerIssue_team_state_idx" ON "AstrologerIssue"("team", "state");

-- CreateIndex
CREATE INDEX "AstrologerIssueMessage_issueId_createdAt_idx" ON "AstrologerIssueMessage"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "AstrologerIssue" ADD CONSTRAINT "AstrologerIssue_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerIssueMessage" ADD CONSTRAINT "AstrologerIssueMessage_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "AstrologerIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
