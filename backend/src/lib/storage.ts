import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { PRIVATE_DIR, UPLOAD_DIR } from "./media.ts";

// Where private media files live (photos and videos sent in messages, support screenshots), behind
// a small interface so the local disk can later be swapped for object storage (S3 or similar)
// without touching the media worker. Keys are the stored file names the database already holds
// (e.g. "3f…9a.mp4"), so the existing signed-in media routes keep serving them.
//
// Only the local-disk implementation exists for now. An S3 one would: put = PutObject,
// toLocalFile = GetObject into the work folder, remove = DeleteObject, and the media routes would
// redirect to a short-lived signed URL (url()) instead of streaming the file themselves.

export interface Storage {
  /** Moves a finished local file into storage under `key` (the local file is gone afterwards). */
  putFile(key: string, localPath: string, contentType: string): Promise<void>;
  /**
   * A local path to read `key` from (FFmpeg needs a file). `done()` frees any temporary copy;
   * for the local disk it is a no-op.
   */
  toLocalFile(key: string): Promise<{ path: string; done: () => Promise<void> }>;
  /** Size in bytes, or null when the object doesn't exist. */
  size(key: string): Promise<number | null>;
  /** Deletes `key`; a missing one is ignored. */
  remove(key: string): Promise<void>;
  /** A direct (signed) URL to hand to the browser, or null when the API serves the file itself. */
  url(key: string): string | null;
}

/** Only names we generate: 32 hex characters and a known extension (never a path). */
const KEY = /^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm)$/;

function checkKey(key: string): string {
  if (!KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

/** The private media folder on this server's disk (backend/uploads/private). */
export class LocalStorage implements Storage {
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  async putFile(key: string, localPath: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const dest = path.join(this.dir, checkKey(key));
    try {
      await rename(localPath, dest);
    } catch {
      // Another volume: copy, then remove the source.
      await copyFile(localPath, dest);
      await unlink(localPath).catch(() => {});
    }
  }

  async toLocalFile(key: string) {
    return { path: path.join(this.dir, checkKey(key)), done: async () => {} };
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(path.join(this.dir, checkKey(key)))).size;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (!KEY.test(key)) return;
    await unlink(path.join(this.dir, key)).catch(() => {});
  }

  url(): string | null {
    return null;
  }
}

/** Private media storage used by the media worker. */
export const privateStorage: Storage = new LocalStorage(PRIVATE_DIR);

/**
 * Scratch folder for work in progress (FFmpeg output before it is stored). Always local: it is
 * per-machine temporary space, even once storage moves to S3.
 */
export const WORK_DIR = path.join(UPLOAD_DIR, "work");

/** Deletes scratch files older than `maxAgeMs` (left behind by a worker that was killed mid-job). */
export async function sweepWorkDir(maxAgeMs: number): Promise<void> {
  const names = await readdir(WORK_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(
    names.map(async (n) => {
      const file = path.join(WORK_DIR, n);
      const s = await stat(file).catch(() => null);
      if (s?.isFile() && s.mtimeMs < cutoff) await unlink(file).catch(() => {});
    }),
  );
}
