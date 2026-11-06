import express, { type Request, type Router } from "express";
import { z } from "zod";
import type { Consultation } from "../generated/prisma/client.ts";
import { CHUNK_MAX_BYTES, finishFromBrowser, putChunk, startTake, type RecordingSide } from "../lib/recordings.ts";

// Uploading a call's audio recording from one side's browser (lib/recordings.ts). The same three
// routes under the customer's /consultations/:id and the astrologer's /portal/consultations/:id;
// `resolve` returns the consultation only if the signed-in person is that side of it (403 otherwise).
//   POST …/recording/takes                       { mimeType } → { take } (null: not started yet, ask again)
//   PUT  …/recording/takes/:take/chunks/:seq?ms=  raw audio bytes (application/octet-stream)
//   POST …/recording/takes/:take/finish          { chunks, durationMs }

type Resolve = (req: Request) => Promise<{ c: Consultation; userId: string }>;

const takeNo = z.coerce.number().int().min(1).max(1000);
const seqNo = z.coerce.number().int().min(0).max(100_000);
const ms = z.coerce.number().int().min(0).max(24 * 3600_000).catch(0);

export function mountRecordingRoutes(router: Router, side: RecordingSide, resolve: Resolve) {
  router.post("/consultations/:id/recording/takes", async (req, res) => {
    const { c, userId } = await resolve(req);
    const { mimeType } = z.object({ mimeType: z.string().max(60) }).parse(req.body ?? {});
    const result = await startTake(c, side, userId, mimeType);
    res.status(result.take === null ? 200 : 201).json(result);
  });

  router.put(
    "/consultations/:id/recording/takes/:take/chunks/:seq",
    express.raw({ type: "application/octet-stream", limit: CHUNK_MAX_BYTES }),
    async (req, res) => {
      const { c, userId } = await resolve(req);
      const result = await putChunk(c, side, userId, takeNo.parse(req.params.take), seqNo.parse(req.params.seq), req.body, ms.parse(req.query.ms));
      if (result.expected !== null) {
        return res.status(409).json({ error: { code: "RECORDING_SEQ", message: "A recording chunk is missing.", expected: result.expected } });
      }
      res.json({ stored: result.stored });
    },
  );

  router.post("/consultations/:id/recording/takes/:take/finish", async (req, res) => {
    const { c } = await resolve(req);
    const body = z.object({ chunks: z.number().int().min(0).max(100_000), durationMs: z.number().int().min(0).max(24 * 3600_000) }).parse(req.body ?? {});
    res.json(await finishFromBrowser(c, side, takeNo.parse(req.params.take), body.chunks, body.durationMs));
  });
}
