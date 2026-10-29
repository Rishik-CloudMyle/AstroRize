import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db.ts";
import { mobileSchema } from "../lib/contact.ts";
import { HttpError, badRequest, conflict, unauthorized } from "../lib/errors.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { rateLimit } from "../lib/safety.ts";
import { clearSessionCookie, setSessionCookie, signSession, type AdminRoleClaim, type RoleClaim } from "../lib/session.ts";
import {
  LANGUAGE_OPTIONS,
  NEW_ASTROLOGER_DEFAULTS,
  SKILL_OPTIONS,
  assertContactsFree,
  emailSchema,
  freeAstrologerKeys,
  passwordSchema,
} from "../lib/signup.ts";
import { sendOtpSms } from "../lib/sms.ts";
import { grantWelcome, welcomePolicy } from "../lib/welcome.ts";
import { requireRole } from "../middleware/auth.ts";
import type { User } from "../generated/prisma/client.ts";

export const authRouter = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/**
 * How many of the number's latest codes still work. "Resend" (or a second tab, or a slow SMS)
 * means people often type an earlier code they were sent; any unexpired, unused one of the
 * last few is accepted, and using one retires the rest.
 */
const OTP_LIVE_CODES = 3;

/** "+91 98765 43210", "09876543210" and "9876543210" are the same number (lib/contact.ts). */
const phoneSchema = mobileSchema;

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
  const [session] = await db.$transaction([
    db.session.create({ data: { userId, expiresAt } }),
    // Signing in again re-activates an account its owner paused ("Deactivate").
    db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), pausedAt: null } }),
  ]);
  const view = publicUser(user);
  const token = await signSession(
    { sid: session.id, sub: user.id, role: view.role, adminRole: view.adminRole, astrologerId: view.astrologerId },
    expiresAt,
  );
  setSessionCookie(res, token, expiresAt);
  return view;
}

// ── Mobile number + one-time code (customers) ──

/** Six digits; spaces or dashes from a pasted code are ignored. */
const codeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.string("Enter the six-digit code.").regex(/^\d{6}$/, "Enter the six-digit code."),
);

const otpError = (message: string, code: string) => new HttpError(400, message, code);

/** Creates a one-time code for the number and texts it (returned as devCode outside production). */
export async function issueOtp(phone: string, ip: string | undefined) {
  rateLimit(`otp:${phone}`, 5, 10 * 60 * 1000, "Too many codes requested. Try again in a few minutes.");
  rateLimit(`otp-ip:${ip}`, 20, 10 * 60 * 1000, "Too many codes requested. Try again in a few minutes.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.otpCode.create({ data: { phone, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  const { devCode } = await sendOtpSms(phone, code);
  return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, devCode };
}

/**
 * Checks a code against the number's live codes (unexpired, unused, the last few) and uses it up,
 * exactly once even when the same request arrives twice. Throws a 400 that says what went wrong
 * (wrong, expired, already used, never sent, too many tries). Returns `release`, which makes the
 * code usable again: call it when signing in fails afterwards, so the person can simply retry.
 */
export async function consumeOtp(phone: string, code: string): Promise<{ release: () => Promise<void> }> {
  const now = new Date();
  const live = await db.otpCode.findMany({
    where: { phone, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: OTP_LIVE_CODES,
  });
  if (!live.length) {
    // Nothing to check against: say why, so "expired" isn't shown for a code that was used or never sent.
    const [last, usedLately] = await Promise.all([
      db.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: "desc" }, select: { id: true } }),
      db.otpCode.findFirst({ where: { phone, consumedAt: { gt: new Date(now.getTime() - OTP_TTL_MS) } }, select: { id: true } }),
    ]);
    if (!last) throw otpError("No code has been sent to this number yet. Request a code first.", "otp_not_sent");
    if (usedLately) throw otpError("That code has already been used. If you aren't signed in, request a new code.", "otp_used");
    throw otpError("That code has expired — codes work for 5 minutes. Request a new one.", "otp_expired");
  }
  const open = live.filter((o) => o.attempts < OTP_MAX_ATTEMPTS);
  if (!open.length) throw otpError("Too many wrong attempts. Request a new code.", "otp_locked");

  const actual = Buffer.from(hashCode(phone, code), "hex");
  const match = open.find((o) => timingSafeEqual(Buffer.from(o.codeHash, "hex"), actual));
  if (!match) {
    // A wrong guess counts against every code still open for the number.
    await db.otpCode.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { attempts: { increment: 1 } } });
    const left = OTP_MAX_ATTEMPTS - 1 - Math.min(...open.map((o) => o.attempts));
    throw otpError(
      left > 0
        ? `That code is not correct. Check the latest code sent to +91 ${phone.slice(0, 5)} ${phone.slice(5)} and try again (${left} ${left === 1 ? "try" : "tries"} left).`
        : "That code is not correct, and that was the last try. Request a new code.",
      "otp_wrong",
    );
  }

  // Use it up only if nobody else just did (a double tap sends the same code twice).
  const used = await db.otpCode.updateMany({ where: { id: match.id, consumedAt: null }, data: { consumedAt: now } });
  if (used.count === 0) throw otpError("That code has already been used. If you aren't signed in, request a new code.", "otp_used");
  // The number is proven: its other open codes stop working.
  const others = open.filter((o) => o.id !== match.id).map((o) => o.id);
  if (others.length) await db.otpCode.updateMany({ where: { id: { in: others }, consumedAt: null }, data: { expiresAt: now } });

  return {
    release: async () => {
      await db.otpCode.update({ where: { id: match.id }, data: { consumedAt: null } }).catch(() => {});
    },
  };
}

authRouter.post("/otp/request", async (req, res) => {
  const phone = phoneSchema.parse(req.body?.phone);
  res.json(await issueOtp(phone, req.ip));
});

authRouter.post("/otp/verify", async (req, res) => {
  const { phone, code } = z.object({ phone: phoneSchema, code: codeSchema }).parse(req.body);
  // Refusals that don't depend on the code come first, so a valid code isn't used up for nothing.
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) refuseOtpSignIn(existing);
  const otp = await consumeOtp(phone, code);

  try {
    // First sign-in creates the customer account and an empty wallet. The number has just been
    // verified, so the account also gets the welcome free call — once per number, ever (lib/welcome.ts).
    let user = existing;
    const created = !user;
    if (!user) {
      const name = "Astrorize customer";
      const { enabled } = await welcomePolicy();
      try {
        user = await db.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: { phone, name, initials: initialsOf(name), role: "CUSTOMER", wallet: { create: {} } },
          });
          if (enabled) await grantWelcome(u.id, phone, tx);
          return u;
        });
      } catch (e) {
        // The same number was signed up a moment ago (another tab): use that account.
        if ((e as { code?: string }).code !== "P2002") throw e;
        user = await db.user.findUniqueOrThrow({ where: { phone } });
        refuseOtpSignIn(user);
      }
    }
    const reactivated = !!user.pausedAt;

    // `created` lets the sign-up page tell a returning customer they already had an account;
    // `reactivated` that their paused account is active again.
    res.json({ user: await startSession(res, user.id), created, reactivated });
  } catch (e) {
    // Signing in failed after the code was accepted (e.g. the database was busy): give the code
    // back so trying again works, instead of answering "That code has already been used".
    await otp.release();
    throw e;
  }
});

/** Accounts that can't sign in with a mobile code (checked before the code is used up). */
function refuseOtpSignIn(user: User) {
  if (user.deletedAt) throw unauthorized("This account was deleted.");
  if (user.role !== "CUSTOMER") throw badRequest("This number belongs to a staff or astrologer account. Sign in with email.");
  if (!user.active) throw unauthorized("This account has been deactivated. Contact support.");
}

// ── Sign-up (customers and astrologers; staff accounts are created by a Super Admin) ──
// Customers sign up with the mobile one-time code above, then fill their profile with
// PUT /api/me/profile. Optionally they also set a password here so email sign-in works.

/** A signed-in customer without a password sets one (needs an email on the account). */
authRouter.post("/password", async (req, res) => {
  const auth = requireRole(req, "customer");
  rateLimit(`set-password:${auth.user.id}`, 10, 10 * 60 * 1000, "Too many attempts. Try again in a few minutes.");
  const { password } = z.object({ password: passwordSchema }).parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (user.passwordHash) throw conflict("This account already has a password.");
  if (!user.email) throw badRequest("Add your email first — you'll log in with it and this password.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  res.json({ ok: true });
});

const astrologerSignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(60, "Your name can be up to 60 characters."),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  /** The directory filters by Male / Female; anything else is left unset. */
  gender: z.enum(["Female", "Male"], "Choose one of the options.").nullish().transform((v) => v ?? null),
  years: z.number("Enter your years of experience.").int("Use whole years.").min(0, "Years of experience can't be negative.").max(60, "Years of experience can be up to 60."),
  skills: z.array(z.enum(SKILL_OPTIONS, "Choose skills from the list.")).min(1, "Choose at least one skill.").max(6, "Choose up to 6 skills."),
  languages: z.array(z.enum(LANGUAGE_OPTIONS, "Choose languages from the list.")).min(1, "Choose at least one language.").max(8, "Choose up to 8 languages."),
});

/** Step 1: checks the details (and that the email and number are free), then texts a code to the number. */
authRouter.post("/signup/astrologer/start", async (req, res) => {
  const input = astrologerSignupSchema.parse(req.body);
  rateLimit(`signup-ip:${req.ip}`, 20, 60 * 60 * 1000, "Too many sign-up attempts. Try again later.");
  await assertContactsFree(input.email, input.phone);
  res.json(await issueOtp(input.phone, req.ip));
});

/**
 * Step 2: the code proves the mobile number; creates the astrologer account in "draft"
 * with an application to continue in the portal, and signs them in.
 */
authRouter.post("/signup/astrologer", async (req, res) => {
  const { code, ...input } = astrologerSignupSchema.extend({ code: codeSchema }).parse(req.body);
  rateLimit(`signup:${input.phone}`, 10, 10 * 60 * 1000, "Too many sign-up attempts. Try again in a few minutes.");
  await assertContactsFree(input.email, input.phone);
  const [keys, last, passwordHash] = await Promise.all([
    freeAstrologerKeys(input.name),
    db.astrologer.aggregate({ _max: { rank: true } }),
    hashPassword(input.password),
  ]);
  const otp = await consumeOtp(input.phone, code);
  const initials = initialsOf(input.name);
  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        role: "ASTROLOGER",
        name: input.name,
        initials,
        email: input.email,
        phone: input.phone,
        passwordHash,
        astrologer: {
          create: {
            ...NEW_ASTROLOGER_DEFAULTS,
            ratingDistribution: [...NEW_ASTROLOGER_DEFAULTS.ratingDistribution],
            id: keys.id,
            slug: keys.slug,
            name: input.name,
            initials,
            greeting: input.name.split(/\s+/)[0]!,
            gender: input.gender,
            years: input.years,
            skills: input.skills,
            languages: input.languages,
            rank: (last._max.rank ?? 0) + 1,
            // Wizard pre-fill: "Full name" (step 2) and empty rate fields (step 11) rather than "₹0".
            application: { create: { values: { "1-0": input.name, "10-0": "", "10-1": "", "10-2": "" } } },
          },
        },
      },
    });
    userId = user.id;
  } catch (e) {
    // The code stays usable, so fixing the details and trying again doesn't need a new one.
    await otp.release();
    // Someone took the email, number or astrologer id between the checks and now.
    if ((e as { code?: string }).code === "P2002") {
      throw conflict("That email or mobile number was just used for another account. Check them and try again.");
    }
    throw e;
  }
  res.status(201).json({ user: await startSession(res, userId) });
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
  if (user.deletedAt) throw unauthorized("This account was deleted.");
  if (!user.active) throw unauthorized("This account has been deactivated. Ask your Super Admin to activate it again.");
  const reactivated = !!user.pausedAt;
  res.json({ user: await startSession(res, user.id), reactivated });
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
