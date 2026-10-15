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
   * Stand-in payment provider that credits the wallet without taking money. Only ever
   * on outside production; production recharges stay off until Razorpay is connected.
   */
  mockPayments: process.env.NODE_ENV !== "production",
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
};
