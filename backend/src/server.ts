import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { sweepCampaigns } from "./lib/campaigns.ts";
import { sweepAbandonedConsultations } from "./lib/consultations.ts";
import { isDatabaseDown } from "./lib/errors.ts";
import { sweepStalePresence } from "./lib/presence.ts";
import { purgeDaily } from "./lib/retention.ts";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Astrorize API listening on http://localhost:${config.port}`);
  // Say clearly, once, if the database isn't reachable, instead of failing on every request.
  db.$queryRaw`SELECT 1`.catch((e: unknown) => {
    const where = new URL(config.databaseUrl).host;
    console.error(
      isDatabaseDown(e)
        ? `Can't reach the database at ${where}. Start it with "npm run db" (from the astrorize-web folder), then run "npm run dev" again.`
        : `Database check failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
    );
  });
});

// Once a minute: settle consultations left open (closed tab, dropped connection), then switch
// off astrologers whose portal has been closed for a while (ending their live room); once a
// day, delete chat and messages older than the retention period.
const sweeper = setInterval(() => {
  sweepAbandonedConsultations()
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Consultation sweep failed:", e);
    })
    .then(() => sweepStalePresence())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Presence sweep failed:", e);
    })
    .then(() => purgeDaily())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Retention purge failed:", e);
    })
    // Campaigns: close ended ones, expire old claims, announce new offers, the daily offers notice.
    .then(() => sweepCampaigns())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Campaign sweep failed:", e);
    });
}, 60_000);

// Finish in-flight requests and close the database cleanly on shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(sweeper);
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
}
