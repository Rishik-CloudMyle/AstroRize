import { config } from "../config.ts";
import { HttpError } from "./errors.ts";

/**
 * Sends the sign-in code by SMS.
 * ⚠ No SMS provider is connected yet (e.g. MSG91, Twilio, AWS SNS). Outside production
 * the code is printed in the server log and returned to the browser so you can sign in.
 * In production mobile sign-in is refused until a provider is plugged in here, so codes
 * never end up in production logs. Nothing else needs to change when it is added.
 */
export async function sendOtpSms(phone: string, code: string): Promise<{ devCode?: string }> {
  if (!config.mockSms) {
    throw new HttpError(503, "Mobile sign-in isn't available yet. Please try again later.", "unavailable");
  }
  console.log(`[sms] sign-in code for +91 ${phone}: ${code}`);
  return { devCode: code };
}
