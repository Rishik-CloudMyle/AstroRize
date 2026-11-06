// The media worker (`npm run worker`): compresses videos sent in messages, separately from the API
// (lib/media-jobs.ts). Run one or more of these next to the API in production with
// MEDIA_WORKER=external on both. Each takes MEDIA_WORKER_CONCURRENCY jobs at a time (default 1).
//
// Locally the database (`prisma dev`) accepts only one connection, which the API already holds, so
// the default there is MEDIA_WORKER=inline: the API takes the jobs itself (FFmpeg still runs as its
// own process) and this worker only says so and waits, so `npm run dev` keeps running.

import { config } from "./config.ts";
import { db } from "./db.ts";
import { mediaWorkerMode, startMediaConsumer, workerHost } from "./lib/media-jobs.ts";

const mode = mediaWorkerMode();

if (mode !== "external") {
  console.log(
    mode === "inline"
      ? "Media worker: idle — videos are compressed inside the API (MEDIA_WORKER=inline). Set MEDIA_WORKER=external on the API and here to use this worker."
      : "Media worker: idle — MEDIA_WORKER=off: videos are delivered uncompressed.",
  );
  // Stay up quietly (the dev runner stops everything when one process exits).
  const idle = setInterval(() => {}, 1 << 30);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      clearInterval(idle);
      process.exit(0);
    });
  }
} else {
  const workerId = `${workerHost()}:${process.pid}`;
  const consumer = startMediaConsumer({ workerId, concurrency: config.mediaConcurrency, pollMs: config.mediaPollMs });
  console.log(`Media worker ${workerId} started (${config.mediaConcurrency} at a time).`);

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      console.log("Media worker stopping: finishing the current job (up to 30 s)…");
      void consumer
        .stop(30_000)
        .then(() => db.$disconnect())
        .finally(() => process.exit(0));
    });
  }
  // Never die on a stray error: log it, the loop carries on.
  process.on("unhandledRejection", (e) => console.error("Media worker:", e));
  process.on("uncaughtException", (e) => console.error("Media worker:", e));
}
