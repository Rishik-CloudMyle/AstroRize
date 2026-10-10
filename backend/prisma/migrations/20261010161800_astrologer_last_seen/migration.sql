-- Heartbeat from the astrologer portal; used to switch silent astrologers offline.
ALTER TABLE "Astrologer" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
