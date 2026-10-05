import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { sweepAbandonedConsultations } from "./lib/consultations.ts";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Astrorize API listening on http://localhost:${config.port}`);
});

// Settle consultations left open (closed tab, dropped connection) once a minute.
const sweeper = setInterval(() => {
  sweepAbandonedConsultations().catch((e) => console.error("Consultation sweep failed:", e));
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
