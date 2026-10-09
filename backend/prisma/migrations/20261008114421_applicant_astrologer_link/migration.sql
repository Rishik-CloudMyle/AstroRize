-- Link a portal-submitted application to the astrologer account that submitted it.
ALTER TABLE "Applicant" ADD COLUMN "astrologerId" TEXT;

CREATE UNIQUE INDEX "Applicant_astrologerId_key" ON "Applicant"("astrologerId");
