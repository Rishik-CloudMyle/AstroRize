// Shrinks photos in the browser before they are uploaded (storage cost, and faster sends): the
// longest side is brought down to `maxSide`, and the picture is re-encoded as WebP (JPEG where the
// browser can't write WebP, e.g. Safari). Re-encoding through a canvas also drops all camera
// metadata (GPS position, device). The photo is turned upright first (EXIF orientation).
// Decoding (createImageBitmap) and encoding (OffscreenCanvas.convertToBlob / canvas.toBlob) run off
// the main thread in modern browsers, so the page stays responsive even for big camera photos.
// The API checks every photo again and re-compresses anything still too big.

export interface CompressOptions {
  /** Longest side of the result, in pixels. */
  maxSide: number;
  /** Encoder quality 0–1 (default 0.8). */
  quality?: number;
  /**
   * A JPEG/WebP/PNG file already this small (bytes) and within maxSide is sent as it is: re-encoding
   * would save next to nothing. Default 120 KB. The API still removes JPEG camera metadata.
   */
  keepBelowBytes?: number;
}

const DEFAULT_QUALITY = 0.8;
const DEFAULT_KEEP_BELOW = 120 * 1024;

const UNREADABLE = "That file isn't a photo we can use. Choose a JPEG, PNG or WebP image.";
const CANT_PREPARE = "Your browser couldn't prepare this photo. Try another one.";

/** Whether this browser writes WebP from a canvas (Safari doesn't: it falls back to PNG). Asked once. */
let webpSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpSupport === null) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(width, height);
    // Some older browsers have OffscreenCanvas without a 2D context or convertToBlob.
    if (typeof c.convertToBlob === "function") return c;
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function encode(canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns the photo ready to upload (its `type` is the Blob's own). GIFs are returned unchanged
 * (re-encoding would lose the animation). Throws an Error with a message to show the person when
 * the file can't be decoded.
 */
export async function compressImage(file: Blob, options: CompressOptions): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const quality = options.quality ?? DEFAULT_QUALITY;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(UNREADABLE);
  }
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, options.maxSide / Math.max(width, height));
    const small = file.size <= (options.keepBelowBytes ?? DEFAULT_KEEP_BELOW);
    if (scale === 1 && small && ["image/jpeg", "image/webp", "image/png"].includes(file.type)) return file;

    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error(CANT_PREPARE);
    const webp = canEncodeWebp();
    // JPEG has no transparency: a transparent PNG gets a white background, not black.
    if (!webp) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);

    let blob = await encode(canvas, webp ? "image/webp" : "image/jpeg", quality);
    if (blob && webp && blob.type !== "image/webp") blob = null; // the encoder quietly fell back to PNG
    if (!blob) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      blob = await encode(canvas, "image/jpeg", quality);
    }
    if (!blob) throw new Error(CANT_PREPARE);
    // Never send a bigger file than the one chosen when nothing had to be resized.
    return scale === 1 && blob.size >= file.size && ["image/jpeg", "image/webp"].includes(file.type) ? file : blob;
  } finally {
    bitmap.close();
  }
}
