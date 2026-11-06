import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { PRIVATE_DIR } from "./media.ts";

// Where call recordings are kept, behind one small interface so the local folder can be swapped for
// object storage (S3) later without touching the routes: chunks arrive one by one while the call
// runs (putChunk) and become one file when the take ends (assemble). Keys are opaque — never URLs —
// and the files are only ever streamed through the Super Admin's authorised route.
//
// ⚠ Production: the local folder is on this server's own disk (not permanent on most hosts, not
// shared between servers). Before going live, point this at S3: putChunk → one object per chunk (or
// a multipart upload part), assemble → complete the multipart upload, read → a ranged GetObject.

export interface RecordingStore {
  /** Stores chunk `seq` of a take (overwrites the same chunk if it is sent again). */
  putChunk(takeId: string, seq: number, data: Buffer): Promise<void>;
  /** Joins chunks 0 … count-1 into one file (applying `patchHead` to the joined bytes), removes the chunks. */
  assemble(takeId: string, count: number, ext: string, patchHead?: (whole: Buffer) => Buffer): Promise<{ key: string; bytes: number }>;
  /** Size of a stored file in bytes, or null when it isn't there. */
  size(key: string): Promise<number | null>;
  /** Reads a stored file, or the inclusive byte range [start, end] of it. */
  read(key: string, range?: { start: number; end: number }): Readable;
  /** Deletes a stored file (missing files are ignored). */
  remove(key: string): Promise<void>;
  /** Deletes any chunks left of a take. */
  removeChunks(takeId: string): Promise<void>;
}

/** Take ids are cuids; keys are "<takeId>.<ext>". Nothing else is ever read or written. */
const TAKE_ID = /^[a-z0-9]{20,40}$/;
const KEY = /^[a-z0-9]{20,40}\.(webm|m4a)$/;

function checkTake(takeId: string) {
  if (!TAKE_ID.test(takeId)) throw new Error("Bad recording id.");
}
function checkKey(key: string) {
  if (!KEY.test(key)) throw new Error("Bad recording key.");
}

/** A private folder on this server (never under a served path: the media routes only serve bare names). */
export function localRecordingStore(root: string): RecordingStore {
  const chunkDir = (takeId: string) => path.join(root, "chunks", takeId);
  const chunkFile = (takeId: string, seq: number) => path.join(chunkDir(takeId), `${String(seq).padStart(6, "0")}.part`);
  return {
    async putChunk(takeId, seq, data) {
      checkTake(takeId);
      await mkdir(chunkDir(takeId), { recursive: true });
      await writeFile(chunkFile(takeId, seq), data);
    },
    async assemble(takeId, count, ext, patchHead) {
      checkTake(takeId);
      const key = `${takeId}.${ext}`;
      checkKey(key);
      await mkdir(root, { recursive: true });
      const parts: Buffer[] = [];
      for (let seq = 0; seq < count; seq++) {
        const fh = await open(chunkFile(takeId, seq), "r");
        try {
          parts.push(await fh.readFile());
        } finally {
          await fh.close();
        }
      }
      let whole: Buffer = Buffer.concat(parts);
      if (patchHead) whole = patchHead(whole);
      await writeFile(path.join(root, key), whole);
      await rm(chunkDir(takeId), { recursive: true, force: true });
      return { key, bytes: whole.length };
    },
    async size(key) {
      checkKey(key);
      try {
        return (await stat(path.join(root, key))).size;
      } catch {
        return null;
      }
    },
    read(key, range) {
      checkKey(key);
      return createReadStream(path.join(root, key), range ? { start: range.start, end: range.end } : undefined);
    },
    async remove(key) {
      checkKey(key);
      await unlink(path.join(root, key)).catch(() => {});
    },
    async removeChunks(takeId) {
      checkTake(takeId);
      await rm(chunkDir(takeId), { recursive: true, force: true });
    },
  };
}

export const RECORDINGS_DIR = path.join(PRIVATE_DIR, "recordings");

/** The store in use. Swap for an S3-backed one later (same interface). */
export const recordingStore: RecordingStore = localRecordingStore(RECORDINGS_DIR);
