import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { badRequest } from "./errors.ts";

// Uploaded media: customer profile photos and astrologers' intro videos (public), and photos
// and videos sent in customer–astrologer messages (private: see PRIVATE_DIR).
//
// ⚠ Production: files are written to this server's own disk (backend/uploads/). That disk is
// not permanent on most hosts (redeploys, autoscaling and container restarts wipe it, and
// several servers don't share it). Before going live, store these in object storage
// (S3 or similar) and keep only the object key in the database; the routes stay the same.

export const UPLOAD_DIR = path.resolve(import.meta.dirname, "../../uploads");
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Largest gallery photo an astrologer may upload (the website downsizes before sending). */
export const MAX_GALLERY_PHOTO_BYTES = 5 * 1024 * 1024;
/** Fallback for Config "profile.gallery.max": photos one astrologer may show on their profile. */
export const GALLERY_MAX_DEFAULT = 8;
/** Longest intro video accepted, in seconds. */
export const MAX_VIDEO_SECONDS = 120;
/** Photos and videos sent in customer–astrologer messages (client decision, Oct 2026). */
export const CHAT_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const CHAT_MAX_VIDEO_SECONDS = 60;
/**
 * Files sent in messages. Never served by the public /api/media/<file> route (it only accepts a
 * bare file name in UPLOAD_DIR); only through the signed-in route that checks the viewer is in
 * that conversation.
 */
export const PRIVATE_DIR = path.join(UPLOAD_DIR, "private");
/** Public path prefix the API serves uploaded files from. */
export const MEDIA_PREFIX = "/api/media/";

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export const VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;
export type VideoType = keyof typeof VIDEO_TYPES;
export type MediaType = ImageType | VideoType;

const CONTENT_TYPE_BY_EXT: Record<string, MediaType> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

const CONTENT_TYPE_EXT: Record<MediaType, string> = { ...IMAGE_TYPES, ...VIDEO_TYPES };

/** Names we generate ourselves: 32 hex characters and a known extension. Nothing else is served. */
const FILE_NAME = /^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm)$/;

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

// ── Image compression (storage cost) ──
// The website already resizes and re-encodes photos (WebP) before upload. The server checks again:
// a photo that is still too big or too large in pixels, needs turning upright, or carries camera
// metadata the simple JPEG cleaner can't remove (WebP/PNG EXIF) is re-encoded here with sharp
// (it runs on libuv's thread pool, so the API stays responsive).

/** Largest stored photo: longest side in pixels and file size; anything bigger is re-encoded. */
export interface ImageLimits {
  maxSide: number;
  maxBytes: number;
}
/** Photos in messages, Help & support screenshots and gallery photos. */
export const PHOTO_LIMITS: ImageLimits = { maxSide: 2000, maxBytes: 600 * 1024 };
/** Profile photos (shown small). */
export const AVATAR_LIMITS: ImageLimits = { maxSide: 1024, maxBytes: 300 * 1024 };
/** Decoding a bigger image than this (pixels) is refused: guards against "decompression bombs". */
const MAX_INPUT_PIXELS = 100_000_000;
const WEBP_QUALITY = 80;

sharp.cache(false);

/**
 * Returns the image ready to store: unchanged (JPEG camera metadata removed) when it is already
 * within `limits`, otherwise resized to fit, turned upright and re-encoded as WebP without metadata.
 * An image sharp can't decode is refused with a clear message.
 */
export async function optimiseImage(buf: Buffer, type: ImageType, limits: ImageLimits = PHOTO_LIMITS): Promise<{ buf: Buffer; type: ImageType }> {
  const input = { limitInputPixels: MAX_INPUT_PIXELS, animated: type === "image/webp" };
  let meta: Metadata;
  try {
    meta = await sharp(buf, input).metadata();
  } catch {
    throw badRequest("That photo couldn't be read. Try another one.");
  }
  const side = Math.max(meta.width ?? 0, meta.pageHeight ?? meta.height ?? 0);
  const turned = (meta.orientation ?? 1) !== 1;
  const otherMetadata = type !== "image/jpeg" && !!(meta.exif || meta.xmp || meta.iptc);
  if (buf.length <= limits.maxBytes && side <= limits.maxSide && !turned && !otherMetadata) {
    return { buf: type === "image/jpeg" ? stripJpegMetadata(buf) : buf, type };
  }
  const encode = (quality: number) =>
    sharp(buf, input)
      .rotate()
      .resize({ width: limits.maxSide, height: limits.maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
  try {
    let out = await encode(WEBP_QUALITY);
    // Very detailed photos: one more, lighter pass.
    if (out.length > limits.maxBytes) out = await encode(WEBP_QUALITY - 15);
    return { buf: out, type: "image/webp" };
  } catch {
    throw badRequest("That photo couldn't be read. Try another one.");
  }
}

/**
 * Saves an image under a random name and returns its public URL (/api/media/<file>). It is
 * compressed first when needed (optimiseImage).
 */
export async function saveImage(buf: Buffer, type: ImageType, limits: ImageLimits = PHOTO_LIMITS): Promise<string> {
  const ready = await optimiseImage(buf, type, limits);
  return saveFile(ready.buf, IMAGE_TYPES[ready.type]);
}

/** Saves a video under a random name and returns its public URL (/api/media/<file>). */
export async function saveVideo(buf: Buffer, type: VideoType): Promise<string> {
  return saveFile(buf, VIDEO_TYPES[type]);
}

async function saveFile(buf: Buffer, ext: string): Promise<string> {
  return MEDIA_PREFIX + (await writeNew(UPLOAD_DIR, buf, ext));
}

async function writeNew(dir: string, buf: Buffer, ext: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, name), buf, { flag: "wx" });
  return name;
}

/**
 * Saves a photo or video sent in a message (or a support screenshot) into the private folder and
 * returns the stored file name (not a URL). Photos are compressed first when needed (optimiseImage),
 * which also removes camera metadata (GPS). Videos are stored as they came (lib/media-jobs.ts
 * compresses message videos afterwards).
 */
export async function savePrivateFile(buf: Buffer, type: MediaType): Promise<string> {
  if (type in IMAGE_TYPES) {
    const ready = await optimiseImage(buf, type as ImageType);
    return writeNew(PRIVATE_DIR, ready.buf, IMAGE_TYPES[ready.type]);
  }
  return writeNew(PRIVATE_DIR, buf, CONTENT_TYPE_EXT[type]);
}

/** Deletes message files by stored name. Missing files and names we couldn't have issued are ignored. */
export async function deletePrivateFiles(names: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    names.map((n) => (n && FILE_NAME.test(n) ? unlink(path.join(PRIVATE_DIR, n)).catch(() => {}) : undefined)),
  );
}

// ── Videos ──

/** MP4 brands we accept (ISO base media). QuickTime (.mov, brand "qt  ") is not one of them. */
const MP4_BRANDS = /^(isom|iso[2-9]|mp41|mp42|mp71|avc1|dash|M4V |M4VH|M4VP|MSNV|f4v |3gp[4-9]|3g2[a-c])$/;

/** The real type of a video, read from its first bytes. The browser's Content-Type is not trusted. */
export function sniffVideo(buf: Buffer): VideoType | null {
  // MP4: a "ftyp" box first, with a known major brand.
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp" && MP4_BRANDS.test(buf.toString("latin1", 8, 12))) return "video/mp4";
  // WebM: an EBML header whose DocType is "webm".
  if (buf.length >= 32 && buf.readUInt32BE(0) === 0x1a45dfa3 && buf.subarray(0, 64).includes("webm", 0, "latin1")) return "video/webm";
  return null;
}

/**
 * The video's length in seconds when the file says (MP4 movie header, WebM segment Duration),
 * or null when it doesn't — e.g. WebM recorded in a browser often has no duration. The website
 * also checks the length before uploading.
 */
export function videoDurationSeconds(buf: Buffer, type: VideoType): number | null {
  return type === "video/mp4" ? mp4Duration(buf) : webmDuration(buf);
}

/** Walks the MP4's top-level boxes to moov → mvhd (timescale and duration). */
function mp4Duration(buf: Buffer): number | null {
  const box = (from: number, to: number, wanted: string): [number, number] | null => {
    let i = from;
    while (i + 8 <= to) {
      let size = buf.readUInt32BE(i);
      let header = 8;
      if (size === 1) {
        if (i + 16 > to) return null;
        size = Number(buf.readBigUInt64BE(i + 8));
        header = 16;
      } else if (size === 0) {
        size = to - i;
      }
      if (size < header || i + size > to) return null;
      if (buf.toString("latin1", i + 4, i + 8) === wanted) return [i + header, i + size];
      i += size;
    }
    return null;
  };
  const moov = box(0, buf.length, "moov");
  const mvhd = moov && box(moov[0], moov[1], "mvhd");
  if (!mvhd) return null;
  const [at, end] = mvhd;
  const version = buf[at];
  if (version === 1) {
    if (at + 32 > end) return null;
    const timescale = buf.readUInt32BE(at + 20);
    return timescale ? Number(buf.readBigUInt64BE(at + 24)) / timescale : null;
  }
  if (at + 20 > end) return null;
  const timescale = buf.readUInt32BE(at + 12);
  return timescale ? buf.readUInt32BE(at + 16) / timescale : null;
}

/** Reads an EBML variable-length number at `i`: [value, length in bytes], or null. */
function vint(buf: Buffer, i: number): [number, number] | null {
  const first = buf[i];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23;
  if (len > 8 || i + len > buf.length) return null;
  let value = first & (0xff >> len);
  for (let k = 1; k < len; k++) value = value * 256 + buf[i + k]!;
  return [value, len];
}

/** The Duration in the WebM segment's Info element (scaled by its TimecodeScale). */
function webmDuration(buf: Buffer): number | null {
  // The Info element (1549A966) sits near the start, before any media clusters.
  const head = buf.subarray(0, Math.min(buf.length, 256 * 1024));
  const at = head.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  if (at < 0) return null;
  const infoSize = vint(head, at + 4);
  if (!infoSize) return null;
  let i = at + 4 + infoSize[1];
  const end = Math.min(head.length, i + infoSize[0]);
  let scaleNs = 1_000_000;
  let duration: number | null = null;
  while (i < end) {
    // Element ids keep their length marker; Info's children use 2- and 3-byte ids.
    const idLen = Math.clz32(head[i]!) - 23;
    if (idLen < 1 || idLen > 4) return null;
    const id = head.readUIntBE(i, idLen);
    const size = vint(head, i + idLen);
    if (!size) return null;
    const data = i + idLen + size[1];
    if (data + size[0] > end) break;
    if (id === 0x2ad7b1 && size[0] >= 1 && size[0] <= 6) scaleNs = head.readUIntBE(data, size[0]);
    if (id === 0x4489 && size[0] === 4) duration = head.readFloatBE(data);
    if (id === 0x4489 && size[0] === 8) duration = head.readDoubleBE(data);
    i = data + size[0];
  }
  return duration === null ? null : (duration * scaleNs) / 1e9;
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
export function mediaContentType(name: string): MediaType | null {
  const m = FILE_NAME.exec(name);
  return m ? CONTENT_TYPE_BY_EXT[m[1]!]! : null;
}
