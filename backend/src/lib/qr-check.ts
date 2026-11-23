import * as jsqrModule from "jsqr";
import sharp from "sharp";
import { findContactDetails, type ContactKind } from "./contact-filter.ts";

type Decode = (data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: "attemptBoth" }) => { data: string } | null;
const jsQR = ((jsqrModule as unknown as { default?: Decode }).default ?? (jsqrModule as unknown as Decode)) as Decode;

// A photo sent in a chat is checked for a QR code before the other side can see it. A QR that only
// holds harmless text or an ordinary web address goes through; one that asks for a payment, opens
// an app, hides a link behind a shortener or an IP address, or carries a phone number / email / UPI
// ID is held back and the sender is reported to the admin team (Trust & reviews).

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "rebrand.ly", "tiny.cc", "wa.me", "t.me"]);
const RISKY_TLDS = [".zip", ".mov", ".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".xyz", ".click", ".country", ".kim"];

/** The text of the first QR code in a photo, or null when there is none (or it can't be read). */
export async function readQr(buf: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: "attemptBoth" });
    return code?.data ?? null;
  } catch {
    return null;
  }
}

/** What is wrong with a QR code's content (as contact kinds, for the flag), or an empty list when it is fine. */
export function judgeQr(payload: string): ContactKind[] {
  const p = payload.trim();
  const lower = p.toLowerCase();
  if (/^upi:|upi:\/\/|^(paytmmp|phonepe|gpay|tez|bhim|intent):/.test(lower)) return ["upi"];
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(lower)?.[1];
  if (scheme && scheme !== "http" && scheme !== "https") return ["link"];
  if (scheme) {
    try {
      const u = new URL(p);
      const host = u.hostname.toLowerCase();
      const bad =
        !!u.username ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
        host.includes("xn--") ||
        SHORTENERS.has(host) ||
        RISKY_TLDS.some((t) => host.endsWith(t)) ||
        /\.(apk|exe|scr|bat|msi|jar)(\?|$)/i.test(u.pathname);
      return bad ? ["link"] : [];
    } catch {
      return ["link"];
    }
  }
  return findContactDetails(p, "FREE");
}
