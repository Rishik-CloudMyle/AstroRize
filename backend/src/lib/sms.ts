import { config } from "../config.ts";
import { HttpError } from "./errors.ts";

/**
 * Sends the sign-in code by SMS through Fast2SMS (https://docs.fast2sms.com/).
 *
 * With FAST2SMS_API_KEY set the code is texted for real, in every environment, and is never
 * returned to the browser. Without it: outside production the code is printed in the server log and
 * returned as `devCode` so you can sign in locally; in production mobile sign-in is refused, so
 * codes never end up in logs or on screen.
 *
 * Routes (FAST2SMS_ROUTE):
 *   "dlt" (default)  the DLT route: FAST2SMS_SENDER_ID is the approved header and FAST2SMS_TEMPLATE_ID
 *                    is Fast2SMS's message id for the approved template; the code fills its one variable.
 *   "otp"            Fast2SMS's ready-made OTP route (no sender id or template needed).
 */

const URL_BULK = process.env.FAST2SMS_URL ?? "https://www.fast2sms.com/dev/bulkV2";
const TIMEOUT_MS = 10_000;

const unavailable = () => new HttpError(503, "Mobile sign-in isn't available yet. Please try again later.", "unavailable");
const failed = () => new HttpError(502, "We couldn't send the code right now. Please try again in a moment.", "sms_failed");

/** Fast2SMS is set up well enough to send. */
export function fast2smsConfigured(): boolean {
  const f = config.fast2sms;
  if (!f.apiKey) return false;
  return f.route === "otp" ? true : !!(f.senderId && f.templateId);
}

async function sendViaFast2sms(phone: string, code: string): Promise<void> {
  const f = config.fast2sms;
  const body =
    f.route === "otp"
      ? { route: "otp", variables_values: code, numbers: phone, flash: 0 }
      : { route: "dlt", sender_id: f.senderId, message: f.templateId, variables_values: code, numbers: phone, flash: 0 };
  let res: Response;
  try {
    res = await fetch(URL_BULK, {
      method: "POST",
      headers: { authorization: f.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error("[sms] Fast2SMS could not be reached.");
    throw failed();
  }
  let json = null as { return?: boolean; message?: unknown; status_code?: number } | null;
  try {
    json = (await res.json()) as typeof json;
  } catch {
    // Not JSON: treated as a failure below.
  }
  if (!res.ok || json?.return !== true) {
    // Logged for us (never the key, never the code): e.g. "Invalid Authentication" or "insufficient balance".
    const why = Array.isArray(json?.message) ? json.message.join(" ") : String(json?.message ?? `HTTP ${res.status}`);
    console.error(`[sms] Fast2SMS refused the message to +91 ${phone.slice(0, 2)}******${phone.slice(-2)}: ${why}`);
    throw failed();
  }
}

export async function sendOtpSms(phone: string, code: string): Promise<{ devCode?: string }> {
  if (fast2smsConfigured()) {
    await sendViaFast2sms(phone, code);
    return {};
  }
  if (!config.mockSms) throw unavailable();
  console.log(`[sms] sign-in code for +91 ${phone}: ${code}`);
  return { devCode: code };
}
