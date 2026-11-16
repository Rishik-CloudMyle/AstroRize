import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors.ts";
import { recordingStore } from "./recording-store.ts";

/**
 * Streams a stored recording to an already-authorised caller (admin Recording page, customer's My
 * consultations): audio content type, inline (never an attachment), private/no-store, Range requests
 * for seeking. The caller checks who may listen; this only sends the bytes.
 */
export async function sendRecordingAudio(
  req: Request,
  res: Response,
  next: NextFunction,
  file: { storageKey: string; mimeType: string; disposition: string },
  size: number,
) {
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Disposition", file.disposition);

  let range: { start: number; end: number } | undefined;
  const header = req.headers.range;
  if (header) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!m || (!m[1] && !m[2])) throw new HttpError(416, "Invalid range.", "bad_range");
    // "bytes=a-b", "bytes=a-" or the last n bytes ("bytes=-n").
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.setHeader("Content-Range", `bytes */${size}`);
      throw new HttpError(416, "Range not satisfiable.", "bad_range");
    }
    end = Math.max(start, end);
    range = { start, end };
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
  } else {
    res.setHeader("Content-Length", String(size));
  }
  const stream = recordingStore.read(file.storageKey, range);
  stream.on("error", (e) => (res.headersSent ? res.destroy(e) : next(e)));
  stream.pipe(res);
}
