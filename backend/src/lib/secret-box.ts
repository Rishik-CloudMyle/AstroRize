import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.ts";

// Encrypts the few details we must keep but never show in full (an astrologer's bank account
// number and PAN). AES-256-GCM with a key from PAYOUT_DATA_KEY. Anyone with the database but not
// the key sees only unreadable text. The key must be set (and kept safe) in production.

let warned = false;

function key(): Buffer {
  if (config.payoutDataKey) return createHash("sha256").update(config.payoutDataKey).digest();
  if (process.env.NODE_ENV === "production") throw new Error("PAYOUT_DATA_KEY is not set: payout details can't be stored.");
  if (!warned) {
    warned = true;
    console.warn("PAYOUT_DATA_KEY is not set — using a development key. Set it before going live.");
  }
  return createHash("sha256").update("astrorize-development-payout-key").digest();
}

/** "iv.tag.cipher" in base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p ?? "", "base64url"));
  if (!iv || !tag || !body) throw new Error("Unreadable payout detail.");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
