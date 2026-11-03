import { db } from "../db.ts";
import type { AuthContext } from "../middleware/auth.ts";
import type { User } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { FLAG_ACTION } from "./contact-flags.ts";
import { HttpError } from "./errors.ts";
import { istDate, istTime } from "./format.ts";
import { notify } from "./notifications.ts";
import { goOffline } from "./presence.ts";
import { configNumber } from "./settings.ts";

// Repeat off-platform contact sharing (client decision, Nov 2026): "should be warned, and if does the
// same action again & again, then their account should be blocked for a certain period; in any
// urgency, admin can cancel that whenever it is needed".
//
//  · Every message the contact filter stops warns its sender in-app (at most one warning an hour).
//  · `moderation.contact_block_after` attempts (default 3) within `moderation.contact_window_days`
//    (default 30) block the account for `moderation.contact_block_days` (default 7). Attempts made
//    before the account's last block started don't count again.
//  · A blocked CUSTOMER can still sign in and see their wallet and history, but can't message, chat,
//    call, join a live chat or queue or send gifts (assertNotBlocked in those routes).
//  · A blocked ASTROLOGER is also partially suspended until the same time (Astrologer.suspendedUntil):
//    offline, no sessions or lives (the existing suspension rules), and no messages.
//  · Compliance or a Super Admin ("account.contact_block") can block by hand, extend or lift a block at
//    any time; it ends by itself at its end time (the minute sweep tidies it up and tells the person).
// Blocks are User.blockedUntil / blockReason / blockedAt; blockedAt stays after a block ends, so
// attempts from before it don't trigger a new one.

export const BLOCK_ACTION = "account.block";
export const BLOCK_EXTEND_ACTION = "account.block.extend";
export const UNBLOCK_ACTION = "account.unblock";
const WARNING_KIND = "moderation.contact_warning";

export async function contactBlockPolicy() {
  const [after, windowDays, blockDays] = await Promise.all([
    configNumber("moderation.contact_block_after", 3),
    configNumber("moderation.contact_window_days", 30),
    configNumber("moderation.contact_block_days", 7),
  ]);
  return {
    after: Math.max(1, Math.round(after)),
    windowDays: Math.max(1, Math.round(windowDays)),
    blockDays: Math.max(1, Math.round(blockDays)),
  };
}

/** "10 Nov 2026, 17:05 IST" */
export const blockEndLabel = (d: Date) => `${istDate(d)}, ${istTime(d)} IST`;

type Blockable = Pick<User, "blockedUntil" | "blockReason">;

/** The account's block while it lasts, else null (a block past its end time is over). */
export function activeBlock(user: Blockable, now = new Date()): { until: Date; reason: string } | null {
  if (!user.blockedUntil || user.blockedUntil <= now) return null;
  return { until: user.blockedUntil, reason: user.blockReason ?? "Repeatedly sharing contact details" };
}

/** What /auth/me says about a block (the website and portal show a banner). */
export function blockView(user: Blockable) {
  const b = activeBlock(user);
  return b ? { until: b.until.toISOString(), untilLabel: blockEndLabel(b.until), reason: b.reason } : null;
}

/** The refusal a blocked account gets (code "account_blocked": the website re-reads the session and shows the banner). */
export function blockedError(b: { until: Date; reason: string }) {
  return new HttpError(
    403,
    `Your account is blocked until ${blockEndLabel(b.until)} (${b.reason}). You can still sign in and see your wallet and history, but you can't message, chat, call, join a live or send gifts until then.`,
    "account_blocked",
  );
}

/** Refuses the request when the signed-in account is blocked. */
export function assertNotBlocked(auth: AuthContext) {
  const b = activeBlock(auth.user);
  if (b) throw blockedError(b);
}

/** The same check by user id (e.g. the astrologer behind a portal request). */
export async function assertUserNotBlocked(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { blockedUntil: true, blockReason: true } });
  const b = user ? activeBlock(user) : null;
  if (b) throw blockedError(b);
}

/**
 * Blocks an account until `until` (or moves the end of a current block there). An astrologer is
 * also partially suspended until then, unless staff already suspended them by hand (that suspension
 * stays as it is). Audited; the person is told.
 */
export async function placeBlock(opts: { userId: string; until: Date; reason: string; actor: AuthContext | null; how: "auto" | "manual" | "extend" }) {
  const now = new Date();
  const user = await db.user.findUniqueOrThrow({
    where: { id: opts.userId },
    select: { id: true, name: true, role: true, blockedUntil: true, astrologer: { select: { id: true, suspension: true, suspendedUntil: true, presence: true } } },
  });
  const wasBlocked = !!user.blockedUntil && user.blockedUntil > now;
  await db.user.update({
    where: { id: user.id },
    data: { blockedUntil: opts.until, blockReason: opts.reason, ...(wasBlocked ? {} : { blockedAt: now }) },
  });
  const a = user.astrologer;
  let endedLive = false;
  if (a) {
    if (a.suspension === "none") {
      await db.astrologer.update({
        where: { id: a.id },
        data: { suspension: "partial", suspensionReason: opts.reason, suspendedAt: now, suspendedUntil: opts.until },
      });
    } else if (a.suspendedUntil) {
      // A suspension that came from a block follows the block's new end.
      await db.astrologer.update({ where: { id: a.id }, data: { suspendedUntil: opts.until, suspensionReason: opts.reason } });
    }
    if (a.presence !== "OFF") endedLive = (await goOffline(a.id)).endedLive;
  }
  const action = opts.how === "extend" ? BLOCK_EXTEND_ACTION : BLOCK_ACTION;
  const side = user.role === "ASTROLOGER" ? "astrologer" : "customer";
  await audit(
    opts.actor,
    action,
    user.id,
    `${user.name} (${side}) blocked until ${blockEndLabel(opts.until)}${opts.how === "auto" ? " · automatic" : ""}${endedLive ? " · live room ended" : ""} · ${opts.reason}`,
  );
  await notify(user.id, {
    kind: "account.blocked",
    title: opts.how === "extend" ? `Your account block was extended to ${istDate(opts.until)}` : `Your account is blocked until ${istDate(opts.until)}`,
    body: `${opts.reason}. Until ${blockEndLabel(opts.until)} you can't ${
      a ? "take sessions, go live or send messages" : "message, chat, call, join a live chat or queue, or send gifts"
    }. ${a ? "Your earnings stay readable in the portal." : "You can still sign in and see your wallet and history."} Sharing phone numbers, emails, links or other contact details isn't allowed on AstroRize.`,
    href: a ? "/portal" : "/wallet",
  });
}

/** Ends a block now (staff, or the sweep once its time is up). Audited; the person is told. */
export async function liftBlock(opts: { userId: string; actor: AuthContext | null; reason: string }) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: opts.userId },
    select: { id: true, name: true, role: true, blockedUntil: true, astrologer: { select: { id: true, suspendedUntil: true } } },
  });
  const { count } = await db.user.updateMany({ where: { id: user.id, blockedUntil: user.blockedUntil }, data: { blockedUntil: null, blockReason: null } });
  if (!count) return false;
  // Only a suspension the block placed is lifted with it (a manual one stays).
  if (user.astrologer?.suspendedUntil) {
    await db.astrologer.update({
      where: { id: user.astrologer.id },
      data: { suspension: "none", suspensionReason: null, suspendedAt: null, suspendedUntil: null },
    });
  }
  const side = user.role === "ASTROLOGER" ? "astrologer" : "customer";
  await audit(opts.actor, UNBLOCK_ACTION, user.id, `${user.name} (${side}) block lifted · ${opts.reason}`);
  await notify(user.id, {
    kind: "account.unblocked",
    title: "Your account block has ended",
    body: `${opts.actor ? "AstroRize lifted the block on your account" : "The block on your account has ended"}. You can use AstroRize as usual again — please keep conversations on the platform and don't share contact details.`,
    href: user.astrologer ? "/portal" : "/",
  });
  return true;
}

/** Minute sweep: blocks whose time is up end (and the suspensions they placed are lifted). */
export async function sweepExpiredBlocks(now = new Date()) {
  const due = await db.user.findMany({ where: { blockedUntil: { lte: now } }, select: { id: true } });
  for (const u of due) await liftBlock({ userId: u.id, actor: null, reason: "the block period ended" });
  // A block-placed suspension whose user block was lifted another way.
  const stale = await db.astrologer.findMany({ where: { suspendedUntil: { lte: now } }, select: { id: true } });
  for (const a of stale) {
    await db.astrologer.updateMany({
      where: { id: a.id, suspendedUntil: { lte: now } },
      data: { suspension: "none", suspensionReason: null, suspendedAt: null, suspendedUntil: null },
    });
  }
}

/** Contact attempts by this person that count towards a block now: in the window, since their last block began. */
export async function countingAttempts(user: Pick<User, "id" | "blockedAt">, windowDays: number, now = new Date()) {
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
  const since = user.blockedAt && user.blockedAt > windowStart ? user.blockedAt : windowStart;
  return db.auditLog.count({ where: { action: FLAG_ACTION, actorId: user.id, at: { gt: since } } });
}

/**
 * After a message was stopped by the contact filter (and flagged): warns the sender (at most once an
 * hour) and blocks the account once the attempts reach the limit. Never throws.
 */
export async function afterContactAttempt(userId: string) {
  try {
    const now = new Date();
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, blockedAt: true, blockedUntil: true, blockReason: true } });
    if (!user || (user.role !== "CUSTOMER" && user.role !== "ASTROLOGER")) return;
    if (activeBlock(user, now)) return;
    const policy = await contactBlockPolicy();
    const attempts = await countingAttempts(user, policy.windowDays, now);
    if (attempts >= policy.after) {
      await placeBlock({
        userId,
        until: new Date(now.getTime() + policy.blockDays * 86_400_000),
        reason: `Shared contact details ${attempts} times in ${policy.windowDays} days`,
        actor: null,
        how: "auto",
      });
      return;
    }
    const recent = await db.notification.findFirst({ where: { userId, kind: WARNING_KIND, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
    if (recent) return;
    const left = policy.after - attempts;
    await notify(userId, {
      kind: WARNING_KIND,
      title: "Warning: contact details aren't allowed",
      body: `We stopped a message with contact details (phone number, email, link, social handle, UPI ID or address). Keep conversations on AstroRize — it protects you and your payments. This was attempt ${attempts} of ${policy.after} in ${policy.windowDays} days: ${
        left === 1 ? "one more" : `${left} more`
      } and your account will be blocked for ${policy.blockDays} ${policy.blockDays === 1 ? "day" : "days"}.`,
      href: user.role === "ASTROLOGER" ? "/portal/messages" : "/messages",
    });
  } catch (e) {
    console.error("Couldn't apply the contact-sharing rule:", e);
  }
}
