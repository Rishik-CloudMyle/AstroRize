import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { sweepExpiredBlocks } from "./lib/account-blocks.ts";
import { sweepCampaigns } from "./lib/campaigns.ts";
import { sweepAbandonedConsultations } from "./lib/consultations.ts";
import { isDatabaseDown } from "./lib/errors.ts";
import { sweepPendingPayments } from "./lib/payments.ts";
import { sweepStalePresence } from "./lib/presence.ts";
import { razorpayConfigured, razorpayMode } from "./lib/razorpay.ts";
import { sweepProcessingRefunds } from "./lib/wallet-refunds.ts";
import { purgeDaily } from "./lib/retention.ts";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`AstroRize API listening on http://localhost:${config.port}`);
  // Which Razorpay mode is on (never the keys themselves).
  if (!razorpayConfigured()) console.log("Razorpay isn't configured: recharges are off.");
  else if (config.isProduction && razorpayMode() === "test") console.warn("⚠ Razorpay TEST keys in production: no real money is collected.");
  else console.log(`Razorpay connected (${razorpayMode()} mode).`);
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
    // Temporary account blocks (repeated contact sharing) whose time is up end.
    .then(() => sweepExpiredBlocks())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Account block sweep failed:", e);
    })
    // Campaigns: close ended ones, expire old claims, announce new offers, the daily offers notice.
    .then(() => sweepCampaigns())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Campaign sweep failed:", e);
    })
    // Razorpay: recharges still open after a few minutes, and refunds still processing.
    .then(() => sweepPendingPayments())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Payment sweep failed:", e);
    })
    .then(() => sweepProcessingRefunds())
    .catch((e: unknown) => {
      if (!isDatabaseDown(e)) console.error("Refund sweep failed:", e);
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
