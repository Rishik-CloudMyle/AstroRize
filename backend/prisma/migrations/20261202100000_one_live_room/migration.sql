-- One live room per astrologer (client sheet, Nov 2026): the setting is fixed at 1.
UPDATE "ConfigKey"
SET "value" = '1', "bounds" = '1–1', "description" = 'Live rooms one astrologer may host at the same time. Fixed at 1.', "dryRun" = 'An astrologer has one live room: one person can host one audience at a time.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'live.room.max_concurrent_per_astrologer';

-- Changes still waiting for approval can no longer apply.
UPDATE "ConfigChange" SET "status" = 'REJECTED'
WHERE "key" = 'live.room.max_concurrent_per_astrologer' AND "status" IN ('DRAFT', 'SUBMITTED');
