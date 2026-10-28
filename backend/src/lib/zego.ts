import { createCipheriv, randomBytes, randomInt } from "node:crypto";
import { config } from "../config.ts";

// ZEGO real-time media (voice, video, live). The browser joins a ZEGO room with a short-lived
// token this server mints from the project's ServerSecret ("token04", ZEGO's official format —
// same layout as ZEGOCLOUD/zego_server_assistant). The secret never leaves the server.
//
// Rooms used by Astrorize:
//   consult-<consultationId>   one-to-one consultation: the customer and the astrologer only
//   live-<roomId>              an astrologer's public live: the host publishes, viewers only play
//   livep-<consultationId>     a private consultation taken from a live: the host and that one
//                              customer only — never the live audience, never compliance monitors

/** True when the ZEGO keys are set, i.e. real audio/video can run. */
export function zegoConfigured(): boolean {
  return config.zegoAppId > 0 && config.zegoServerSecret.length === 32;
}

/** The web server address the browser SDK connects to: the project's own (ZEGO console), else the standard one. */
export function zegoServerUrl(): string {
  return config.zegoServerUrl || `wss://webliveroom${config.zegoAppId}-api.zegocloud.com/ws`;
}

/** What a token lets its holder do in one room (ZEGO "privilege" payload). */
export interface RoomPrivilege {
  roomId: string;
  /** May publish (send) audio/video. Viewers and monitors: false. */
  publish: boolean;
  /** When set, the holder may publish only these stream ids (and nothing else). */
  streamIds?: string[];
}

const PRIVILEGE_LOGIN = 1;
const PRIVILEGE_PUBLISH = 2;

/**
 * Mints a ZEGO token04 for `userId`, valid for `seconds` (default 1 hour), restricted to one room
 * and to publishing only when allowed. Throws when ZEGO isn't configured.
 */
export function zegoToken(userId: string, privilege: RoomPrivilege, seconds = 3600): string {
  if (!zegoConfigured()) throw new Error("ZEGO is not configured (ZEGO_APP_ID / ZEGO_SERVER_SECRET).");
  const payload = JSON.stringify({
    room_id: privilege.roomId,
    privilege: { [PRIVILEGE_LOGIN]: 1, [PRIVILEGE_PUBLISH]: privilege.publish ? 1 : 0 },
    stream_id_list: privilege.streamIds ?? null,
  });
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    app_id: config.zegoAppId,
    user_id: userId,
    nonce: randomInt(-(2 ** 31), 2 ** 31 - 1),
    ctime: now,
    expire: now + seconds,
    payload,
  });
  // AES-256-CBC (32-byte secret as the key), PKCS#7 padding, a random 16-character IV.
  const iv = randomBytes(12).toString("base64url").slice(0, 16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(config.zegoServerSecret, "utf8"), Buffer.from(iv, "utf8"));
  const encrypted = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);

  // expire (int64 BE) · iv length (uint16 BE) · iv · ciphertext length (uint16 BE) · ciphertext
  const expire = Buffer.alloc(8);
  expire.writeBigInt64BE(BigInt(now + seconds));
  const ivLen = Buffer.alloc(2);
  ivLen.writeUInt16BE(iv.length);
  const encLen = Buffer.alloc(2);
  encLen.writeUInt16BE(encrypted.length);
  return "04" + Buffer.concat([expire, ivLen, Buffer.from(iv, "utf8"), encLen, encrypted]).toString("base64");
}

/** The ZEGO room ids Astrorize uses (see the list at the top). */
export const zegoRoom = {
  consult: (consultationId: string) => `consult-${consultationId}`,
  live: (roomId: string) => `live-${roomId}`,
  livePrivate: (consultationId: string) => `livep-${consultationId}`,
};

/**
 * A ZEGO user id for one of our users (ZEGO allows letters, digits and _ - only). ZEGO signs out
 * ("kicks out") an earlier session when the same user id logs in again, so the same person must
 * use a different id in a live room than in a consultation room: the astrologer stays in their
 * live while taking a private call from it, and the customer goes back to watching it afterwards.
 */
export function zegoUserId(userId: string, scope: "consult" | "live" = "consult"): string {
  return `u_${userId}${scope === "live" ? "_live" : ""}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}
