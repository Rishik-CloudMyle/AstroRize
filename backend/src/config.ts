// All settings come from environment variables (see .env.example).

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} — copy .env.example to .env`);
  return value;
}

const sessionSecret = required("SESSION_SECRET");
if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters long");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  /** Max open database connections. The local `prisma dev` database only handles one at a time. */
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  sessionSecret,
  isProduction: process.env.NODE_ENV === "production",
  /**
   * Razorpay (wallet recharges and bank refunds). Key id and key secret come from the Razorpay
   * dashboard → Account & Settings → API keys (rzp_test_… in test mode, rzp_live_… live). Until both
   * are set, recharges are off and the website says payments aren't connected. Only the key id
   * ever reaches the browser; the secret stays here.
   */
  razorpayKeyId: (process.env.RAZORPAY_KEY_ID ?? process.env.RAZORPAY_ID ?? "").trim(),
  razorpayKeySecret: (process.env.RAZORPAY_KEY_SECRET ?? process.env.RAZORPAY_SECRET_KEY ?? "").trim(),
  /** The secret set on the Razorpay webhook (dashboard → Webhooks); empty = webhook refused. */
  razorpayWebhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim(),
  /** Prints sign-in codes instead of texting them. Never on in production. */
  mockSms: process.env.NODE_ENV !== "production",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  /** Session cookie lifetime. */
  sessionDays: 30,
  /**
   * ZEGO (real-time voice, video and live streaming, per the client's Live spec Amendment No.1).
   * Both come from the ZEGO console (project → AppID / ServerSecret). Until they are set, calls and
   * lives run without audio/video and the website says so.
   */
  zegoAppId: Number(process.env.ZEGO_APP_ID ?? 0),
  zegoServerSecret: process.env.ZEGO_SERVER_SECRET ?? "",
  /** ZEGO's web server address for this project (ZEGO console → project → "Server URL" for Web).
   *  Projects differ in domain, so it comes from the console; empty = the standard zegocloud address. */
  zegoServerUrl: (process.env.ZEGO_SERVER_URL ?? "").trim(),
  /**
   * Birthplace search via OpenStreetMap Nominatim. Their usage policy asks for an identifying
   * User-Agent with a contact; GEOCODER_CONTACT (an email) is sent with every request.
   */
  geocoderContact: process.env.GEOCODER_CONTACT ?? "",
  nominatimUrl: (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/+$/, ""),
};
