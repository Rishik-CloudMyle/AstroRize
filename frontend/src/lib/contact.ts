// Customer contact details, gender and time of birth: the same rules as the API
// (backend/src/lib/contact.ts and lib/profile.ts), so mistakes show before anything is sent.

/**
 * The digits of a mobile number field. A pasted or autofilled "+91 98765 43210" or
 * "09876543210" becomes "9876543210" (not "9198765432"); typing is capped at 10 digits.
 */
export function mobileDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, 10);
}

/** Why a 10-digit mobile number can't be used, or null when it's fine. */
export function mobileProblem(phone: string): string | null {
  if (!phone) return "Enter your 10-digit mobile number.";
  if (!/^[6-9]\d{9}$/.test(phone)) return "Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9).";
  if (/^(\d)\1{9}$/.test(phone)) return "That doesn't look like a real mobile number. Enter your own number.";
  return null;
}

/** "+91 98765 43210" */
export function formatMobile(phone: string): string {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** A sensible email address (trimmed, any case): "abc@x.y", "a..b@mail.com" and "name@mail" are refused. */
export function isValidEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.length <= 254 && EMAIL_PATTERN.test(e);
}

export const EMAIL_MESSAGE = "Enter a valid email address, like name@example.com.";

// ── Gender ──

export const GENDERS = ["Female", "Male", "Other", "Prefer not to say"] as const;

/** Profiles saved before the change hold "Woman" / "Man"; they are shown (and edited) as the new words. */
export function genderLabel(g: string | null | undefined): string | null {
  if (!g) return null;
  return g === "Woman" ? "Female" : g === "Man" ? "Male" : g;
}

// ── Time of birth: typed as 12-hour "hh:mm" + AM/PM, stored as 24-hour "HH:MM" ──

export type Period = "AM" | "PM";

/** "18:42" → { time: "06:42", period: "PM" }; "00:15" → 12:15 AM. Anything else → blank. */
export function from24h(value: string | null | undefined): { time: string; period: Period | "" } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!m) return { time: "", period: "" };
  const h = Number(m[1]);
  return { time: `${String(h % 12 || 12).padStart(2, "0")}:${m[2]}`, period: h < 12 ? "AM" : "PM" };
}

/** "18:42" → "06:42 PM" (blank stays blank). */
export function time12(value: string | null | undefined): string {
  const t = from24h(value);
  return t.time ? `${t.time} ${t.period}` : "";
}

/** Tidies what is typed into "h:mm" / "hh:mm": digits and one colon; "642" → "6:42", "0642" → "06:42". */
export function typeTime(raw: string): string {
  const cleaned = raw.replace(/[^\d:]/g, "");
  if (cleaned.includes(":")) {
    const [h = "", m = ""] = cleaned.split(":");
    return `${h.slice(0, 2)}:${m.replace(/:/g, "").slice(0, 2)}`;
  }
  const d = cleaned.slice(0, 4);
  if (d.length >= 2 && Number(d.slice(0, 2)) > 12) return `${d[0]}:${d.slice(1, 3)}`;
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/** Why a typed 12-hour time can't be used, or null (blank is fine: the time is optional). */
export function time12Problem(time: string, period: Period | ""): string | null {
  if (!time.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return "Enter the time as hh:mm, for example 06:42.";
  const h = Number(m[1]);
  if (h < 1 || h > 12) return "Hours go from 1 to 12.";
  if (Number(m[2]) > 59) return "Minutes go from 00 to 59.";
  if (!period) return "Choose AM or PM.";
  return null;
}

/** "6:42" + "PM" → "18:42"; "12:05" + "AM" → "00:05". Blank or invalid → "". */
export function to24h(time: string, period: Period | ""): string {
  if (!time.trim() || time12Problem(time, period)) return "";
  const [h, m] = time.trim().split(":").map(Number);
  return `${String((h % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "6:4" stays as typed; "6:42" → "06:42" (when leaving the field). */
export function padTime(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : time;
}
