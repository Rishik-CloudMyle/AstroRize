import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db.ts";
import { badRequest, unauthorized } from "../lib/errors.ts";
import { verifyPassword } from "../lib/password.ts";
import { rateLimit } from "../lib/safety.ts";
import { clearSessionCookie, setSessionCookie, signSession, type AdminRoleClaim, type RoleClaim } from "../lib/session.ts";
import { sendOtpSms } from "../lib/sms.ts";
import type { User } from "../generated/prisma/client.ts";

export const authRouter = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.");

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", config.sessionSecret).update(`${phone}:${code}`).digest("hex");
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "A"
  );
}

/** Public view of the signed-in person. */
export function publicUser(user: User & { astrologer?: { id: string; slug: string } | null }) {
  return {
    id: user.id,
    name: user.name,
    initials: user.initials,
    email: user.email,
    phone: user.phone,
    role: user.role.toLowerCase() as RoleClaim,
    adminRole: user.adminRole?.toLowerCase() as AdminRoleClaim | undefined,
    astrologerId: user.astrologer?.id,
    astrologerSlug: user.astrologer?.slug,
  };
}

/** Creates a session row and sets the signed cookie. */
async function startSession(res: import("express").Response, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { astrologer: { select: { id: true, slug: true } } } });
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000);
  const session = await db.session.create({ data: { userId, expiresAt } });
  const view = publicUser(user);
  const token = await signSession(
    { sid: session.id, sub: user.id, role: view.role, adminRole: view.adminRole, astrologerId: view.astrologerId },
    expiresAt,
  );
  setSessionCookie(res, token, expiresAt);
  return view;
}

// ── Mobile number + one-time code (customers) ──

authRouter.post("/otp/request", async (req, res) => {
  const phone = phoneSchema.parse(req.body?.phone);
  rateLimit(`otp:${phone}`, 5, 10 * 60 * 1000, "Too many codes requested. Try again in a few minutes.");
  rateLimit(`otp-ip:${req.ip}`, 20, 10 * 60 * 1000, "Too many codes requested. Try again in a few minutes.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.otpCode.create({ data: { phone, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  const { devCode } = await sendOtpSms(phone, code);
  res.json({ sent: true, expiresInSeconds: OTP_TTL_MS / 1000, devCode });
});

authRouter.post("/otp/verify", async (req, res) => {
  const { phone, code } = z
    .object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, "Enter the six-digit code.") })
    .parse(req.body);

  const otp = await db.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw badRequest("That code has expired. Request a new one.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("Too many wrong attempts. Request a new code.");

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(phone, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("That code is not correct.");
  }
  await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  // First sign-in creates the customer account and an empty wallet.
  let user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    const name = "Astrorize customer";
    user = await db.user.create({
      data: { phone, name, initials: initialsOf(name), role: "CUSTOMER", wallet: { create: {} } },
    });
  }
  if (user.role !== "CUSTOMER") throw badRequest("This number belongs to a staff or astrologer account. Sign in with email.");

  res.json({ user: await startSession(res, user.id) });
});

// ── Email + password (astrologers, staff, and customers who set a password) ──

authRouter.post("/login", async (req, res) => {
  const { email, password } = z
    .object({ email: z.email("Enter a valid email address.").transform((e) => e.trim().toLowerCase()), password: z.string().min(1, "Enter your password.") })
    .parse(req.body);
  rateLimit(`login:${email}`, 10, 10 * 60 * 1000, "Too many attempts. Try again in a few minutes.");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized(user ? "That password is not correct." : "No account uses this email. Customers can also sign in with their mobile number.");
  }
  res.json({ user: await startSession(res, user.id) });
});

authRouter.post("/logout", async (req, res) => {
  if (req.auth) await db.session.update({ where: { id: req.auth.sessionId }, data: { revokedAt: new Date() } });
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  if (!req.auth) return res.json({ user: null });
  const user = await db.user.findUniqueOrThrow({
    where: { id: req.auth.user.id },
    include: { astrologer: { select: { id: true, slug: true } } },
  });
  res.json({ user: publicUser(user) });
});
