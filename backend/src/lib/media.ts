import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Uploaded images (customer profile photos).
//
// ⚠ Production: files are written to this server's own disk (backend/uploads/). That disk is
// not permanent on most hosts (redeploys, autoscaling and container restarts wipe it, and
// several servers don't share it). Before going live, store these in object storage
// (S3 or similar) and keep only the object key in the database; the routes stay the same.

export const UPLOAD_DIR = path.resolve(import.meta.dirname, "../../uploads");
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** Public path prefix the API serves uploaded files from. */
export const MEDIA_PREFIX = "/api/media/";

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

const CONTENT_TYPE_BY_EXT: Record<string, ImageType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Names we generate ourselves: 32 hex characters and a known extension. Nothing else is served. */
const FILE_NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

/** The real type of an image, read from its first bytes. The browser's Content-Type is not trusted. */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Drops EXIF/XMP (APP1) and IPTC (APP13) blocks from a JPEG. Phone photos carry the GPS
 * position they were taken at, which must not reach anyone the photo is shown to.
 * The website already re-encodes photos before upload; this covers direct API calls.
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1]!;
    // 0xFF fill bytes may pad between segments.
    if (marker === 0xff) {
      parts.push(buf.subarray(i, i + 1));
      i += 1;
      continue;
    }
    // Start of scan: the compressed image follows; copy the rest unchanged.
    if (marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    if (marker !== 0xe1 && marker !== 0xed) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  parts.push(buf.subarray(i));
  return Buffer.concat(parts);
}

/** Saves an image under a random name and returns its public URL (/api/media/<file>). */
export async function saveImage(buf: Buffer, type: ImageType): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${IMAGE_TYPES[type]}`;
  await writeFile(path.join(UPLOAD_DIR, name), type === "image/jpeg" ? stripJpegMetadata(buf) : buf, { flag: "wx" });
  return MEDIA_PREFIX + name;
}

/** The stored file name for a media URL we issued, or null for anything else (e.g. /assets/... photos). */
export function mediaFileOf(url: string | null | undefined): string | null {
  if (!url?.startsWith(MEDIA_PREFIX)) return null;
  const name = url.slice(MEDIA_PREFIX.length);
  return FILE_NAME.test(name) ? name : null;
}

/** Deletes an uploaded file we issued. Missing files and other URLs are ignored. */
export async function deleteMedia(url: string | null | undefined): Promise<void> {
  const name = mediaFileOf(url);
  if (!name) return;
  await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

/** Content type for a requested file name, or null when the name isn't one we could have issued. */
export function mediaContentType(name: string): ImageType | null {
  const m = FILE_NAME.exec(name);
  return m ? CONTENT_TYPE_BY_EXT[m[1]!]! : null;
}
