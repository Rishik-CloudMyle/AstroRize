import { timingSafeEqual } from "node:crypto";
import { config } from "../../config.ts";

// Acefone (https://docs.acefone.in): "click to call" rings the astrologer first, then the customer,
// and bridges them. Both are called from AstroRize's number. Phone numbers go to Acefone in this
// request and nowhere else: they are never stored with the call, logged or sent to a browser.
// Another provider can replace this file (same four functions).

export const phoneConfigured = () => !!(config.acefoneToken && config.acefoneCallerId && config.acefoneWebhookSecret);

export class PhoneProviderError extends Error {}

/** Provider messages may quote a number: long digit runs are masked before anything is kept. */
export const scrub = (s: string) => s.replace(/\+?\d[\d\s-]{4,}\d/g, "••••").slice(0, 200);

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(config.acefoneBase + path, {
      method,
      headers: { authorization: `Bearer ${config.acefoneToken}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PhoneProviderError("Couldn't reach the phone service.");
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.success === false) {
    throw new PhoneProviderError(scrub(`Phone service ${res.status}: ${String(json?.message ?? "no details")}`));
  }
  return json;
}

/** "9198XXXXXXXX": digits with the country code (Indian numbers given without one get 91). */
export function dialNumber(phone: string) {
  const d = phone.replace(/\D/g, "").replace(/^0+/, "");
  return d.length === 10 ? `91${d}` : d;
}

export async function startCall(input: { astrologerPhone: string; customerPhone: string; sessionRef: string; maxSeconds: number }) {
  const json = await call("POST", "/v1/click_to_call", {
    agent_number: dialNumber(input.astrologerPhone),
    destination_number: dialNumber(input.customerPhone),
    caller_id: config.acefoneCallerId,
    async: 1,
    call_timeout: input.maxSeconds,
    // Only our session number (letters and digits): nothing that identifies a person.
    custom_identifier: { session: input.sessionRef.replace(/[^A-Za-z0-9]/g, "") },
  });
  const ref = String(json.ref_id ?? "");
  if (!ref) throw new PhoneProviderError("The phone service didn't return a call reference.");
  return { ref };
}

export async function hangupCall(c: { ref: string | null; callId: string | null }) {
  if (!c.ref && !c.callId) return;
  await call("POST", "/v1/call/hangup", c.callId ? { call_id: c.callId } : { ref_id: c.ref });
}

/** The recording's address from the call records (when the webhook didn't carry it). */
export async function findRecordingUrl(callId: string): Promise<string | null> {
  const json = await call("GET", `/v1/call/records?call_id=${encodeURIComponent(callId)}`);
  const row = (json.results as Record<string, unknown>[] | undefined)?.find((r) => r.call_id === callId);
  return typeof row?.recording_url === "string" && row.recording_url ? row.recording_url : null;
}

const MAX_RECORDING_BYTES = 80 * 1024 * 1024;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i;

/** Fetches a recording into memory, from the provider only over https; refuses anything that isn't audio. */
export async function downloadRecording(url: string): Promise<{ data: Buffer; mime: "audio/mpeg" | "audio/wav" }> {
  const u = new URL(url);
  const testHost = u.host === new URL(config.acefoneBase).host;
  if (!testHost && (u.protocol !== "https:" || PRIVATE_HOST.test(u.hostname))) throw new PhoneProviderError("Recording address refused.");
  const ours = testHost || u.hostname.endsWith(".acefone.in") || u.hostname.endsWith(".acefone.com");
  const res = await fetch(u, { headers: ours ? { authorization: `Bearer ${config.acefoneToken}` } : {}, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new PhoneProviderError(`Recording download failed (${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RECORDING_BYTES) throw new PhoneProviderError("Recording too large.");
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_RECORDING_BYTES) throw new PhoneProviderError("Recording too large.");
  if (data.subarray(0, 4).toString("latin1") === "RIFF") return { data, mime: "audio/wav" };
  if (data.subarray(0, 3).toString("latin1") === "ID3" || (data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0)) return { data, mime: "audio/mpeg" };
  throw new PhoneProviderError("The recording isn't ready yet.");
}

/** The secret we ask Acefone to send as a header with every webhook. */
export function webhookSecretOk(given: string | undefined) {
  const want = Buffer.from(config.acefoneWebhookSecret);
  const got = Buffer.from(given ?? "");
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

export interface PhoneEvent {
  ref: string | null;
  callId: string | null;
  talkSeconds: number;
  recordingUrl: string | null;
}

/** Only the four things we need are read from a webhook; the rest (numbers included) is dropped. */
export function readEvent(body: unknown): PhoneEvent {
  const flat = new Map(Object.entries((body ?? {}) as Record<string, unknown>).map(([k, v]) => [k.replace(/^\$/, ""), v]));
  const text = (k: string) => {
    const v = flat.get(k);
    return typeof v === "string" && v && !v.startsWith("$") ? v.slice(0, 2000) : null;
  };
  return { ref: text("ref_id"), callId: text("call_id"), talkSeconds: Math.max(0, Math.round(Number(flat.get("billsec")) || 0)), recordingUrl: text("recording_url") };
}
