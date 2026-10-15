import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "../lib/audit.ts";
import { MAX_SESSION_SECONDS, VIDEO_PREMIUM, instantRate } from "../lib/billing.ts";
import { META, draftValues, metaValues, missingFor, nextApplicantId, submittedOn, wizardValues } from "../lib/application.ts";
import {
  INCOMING_WINDOW_SECS,
  acceptConsultation,
  endConsultation,
  expireStaleRequests,
  lockKey,
  sessionCapSeconds,
  settlementView,
} from "../lib/consultations.ts";
import { COMPLIMENTARY, dailyLimitOf, freeCallsToday, releaseWelcome, welcomePolicy } from "../lib/welcome.ts";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { ageLabel, istDate, istDateKey, istDayMonth, istTime, makeRef, weekdayLabel } from "../lib/format.ts";
import { consultSummary, messageSummary, queueProfile, queueSummary } from "../lib/profile.ts";
import {
  checkSendRate,
  directText,
  directThreadFor,
  directUnread,
  historyWith,
  lastDelivered,
  messageText,
  messageView,
  postMessage,
  replyDirect,
  teamConversations,
  teamThreadView,
  visibleTo,
} from "../lib/messaging.ts";
import { CONTACT_BLOCKED_NOTICE, containsContactDetails, rateLimit } from "../lib/safety.ts";
import { canWork, effectivePresence, endLiveRoom, goOffline, goOnline, markSeen, syncPresence, viewerCount } from "../lib/presence.ts";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_TYPES, deleteMedia, saveVideo, sniffVideo, videoDurationSeconds } from "../lib/media.ts";
import { checkDetailsText, detailsDiff, detailsSchema, liveCategories, sessionFeed } from "../lib/live.ts";
import { configNumber, getSetting } from "../lib/settings.ts";
import { roleGuard, type AuthContext } from "../middleware/auth.ts";
import type { Astrologer, EarningsLine } from "../generated/prisma/client.ts";

// The astrologer portal. Every route acts on the signed-in astrologer's own record.
export const portalRouter = Router();
portalRouter.use(roleGuard("astrologer"));

const MULTIPLIER_OPTIONS = [1.5, 2, 3, 4];
const SKILL_POOL = ["Prashna", "Vastu", "Numerology", "Tarot", "Palmistry", "Life Coaching"];
const HOURS = ["10:00", "11:00", "12:00", "13:00", "14:00", "16:00", "18:00", "20:00"];

async function me(req: Request): Promise<Astrologer> {
  const auth = req.auth as AuthContext;
  const a = await db.astrologer.findUnique({ where: { userId: auth.user.id } });
  if (!a) throw forbidden("This account is not linked to an astrologer profile.");
  return a;
}


// ── Account & dashboard ──

portalRouter.get("/account", async (req, res) => {
  const a = await me(req);
  await expireStaleRequests(a.id);
  const [requests, threads, teamUnread, notices, draft, slaDays] = await Promise.all([
    db.consultation.count({ where: { astrologerId: a.id, status: "REQUESTED" } }),
    db.messageThread.findMany({ where: { astrologerId: a.id }, include: { messages: { where: { blocked: false }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    directUnread((req.auth as AuthContext).user.id),
    db.complianceNotice.count({ where: { astrologerId: a.id, status: "OPEN" } }),
    db.applicationDraft.findUnique({ where: { astrologerId: a.id }, select: { values: true } }),
    configNumber("hr.application.review_sla_days", 5),
  ]);
  const meta = draftValues(draft?.values);
  res.json({
    account: {
      astrologer: {
        id: a.id,
        slug: a.slug,
        name: a.name,
        initials: a.initials,
        greeting: a.greeting,
        photo: a.photo,
        skills: a.skills,
        years: a.years,
        rating: a.rating,
        consults: a.consults,
        price: a.price,
        was: a.was,
        instantMultiplier: a.instantMultiplier,
        bio: a.about,
      },
      status: {
        lifecycle: a.lifecycle,
        suspension: a.suspension,
        // Where the application stands, for the banner: when it went to HR and HR's latest note.
        submittedOn: submittedOn(meta),
        note: meta[META.note] ?? null,
        reviewDays: slaDays,
      },
      counts: {
        consultations: requests,
        // Customers waiting for a reply, plus Astrorize team conversations with unread messages.
        messages: threads.filter((t) => t.messages[0]?.sender === "CUSTOMER").length + teamUnread.size,
        compliance: notices,
      },
      online: effectivePresence(a) !== "OFF",
      /** on | busy | live | off */
      presence: effectivePresence(a).toLowerCase(),
    },
  });
});

/**
 * Amount an earnings line is worth to the astrologer (₹). A session's minutes are worth the rate
 * fixed when it was requested (`rates`, by session ref), so a later price change never rewrites
 * past earnings; lines without a session fall back to the astrologer's current rates.
 * Welcome (free call) lines and adjustments are ₹0.
 */
function lineAmount(a: Astrologer, l: Pick<EarningsLine, "kind" | "minutes" | "sessionRef">, rates: Map<string, number>): number {
  // Gift lines carry their value in `gifts`, not minutes.
  if (l.kind === "adjustment" || l.kind === "welcome" || l.kind === "gift") return 0;
  const rate =
    rates.get(l.sessionRef) ??
    (l.kind === "video" ? a.price + VIDEO_PREMIUM : l.kind === "emergency" ? instantRate(a.price, a.instantMultiplier) : a.price);
  return l.minutes * rate;
}

/** The per-minute rate each line's session was billed at, by session ref. */
async function sessionRates(astrologerId: string, lines: Pick<EarningsLine, "sessionRef">[]): Promise<Map<string, number>> {
  const refs = [...new Set(lines.map((l) => l.sessionRef))];
  if (!refs.length) return new Map();
  const sessions = await db.consultation.findMany({ where: { astrologerId, ref: { in: refs } }, select: { ref: true, rate: true } });
  return new Map(sessions.map((c) => [c.ref, c.rate]));
}

/** Today's free calls (welcome campaign) for the portal: taking part, the limit and what is left. */
async function freeCallsView(a: Astrologer) {
  const [policy, today] = await Promise.all([welcomePolicy(), freeCallsToday(a.id)]);
  const limit = dailyLimitOf(a, policy);
  return { enabled: policy.enabled && a.freeCallsEnabled, limit, today, remaining: Math.max(0, limit - today) };
}

portalRouter.get("/dashboard", async (req, res) => {
  const a = await me(req);
  const now = new Date();
  const todayKey = istDateKey(now);
  const since = new Date(now.getTime() - 10 * 86400000);
  const [lines, slots, room, training, reviews, maxMultiplier] = await Promise.all([
    db.earningsLine.findMany({ where: { astrologerId: a.id, date: { gte: since } } }),
    db.availabilitySlot.findMany({ where: { astrologerId: a.id, date: new Date(todayKey + "T00:00:00Z"), state: { not: "CANCELLED" } }, orderBy: { start: "asc" }, include: { customer: true } }),
    db.liveRoom.findUnique({ where: { astrologerId: a.id } }),
    db.trainingModule.findMany({ where: { astrologerId: a.id }, orderBy: { rank: "asc" } }),
    db.review.findMany({ where: { astrologerId: a.id, status: "VISIBLE" }, orderBy: { createdAt: "desc" }, take: 2 }),
    configNumber("consult.emergency.max_multiplier", 4),
  ]);

  // Earnings per day for the last 10 days (bar heights are a % of the best day).
  const rates = await sessionRates(a.id, lines);
  const byDay = new Map<string, number>();
  for (let i = 9; i >= 0; i--) byDay.set(istDateKey(new Date(now.getTime() - i * 86400000)), 0);
  for (const l of lines) {
    const k = istDateKey(l.date);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + lineAmount(a, l, rates) + l.gifts);
  }
  const days = [...byDay.values()];
  const best = Math.max(1, ...days);
  const today = days[days.length - 1] ?? 0;
  const yesterday = days[days.length - 2] ?? 0;
  const todayLines = lines.filter((l) => istDateKey(l.date) === todayKey);

  const schedule: { id: string | null; time: string; what: string; kind: "open" | "booked" | "live"; customer: ReturnType<typeof messageSummary> | null }[] = slots.map((s) => {
    const customer = s.state === "BOOKED" && s.customer ? messageSummary(s.customer) : null;
    return {
      id: s.id,
      time: `${s.start} – ${s.end}`,
      what: s.state === "BOOKED" ? `${s.detail ?? "Booked session"}${customer ? ` with ${customer.name}` : ""}` : "Open availability",
      kind: s.state === "BOOKED" ? "booked" : "open",
      customer,
    };
  });
  if (room?.isLive) schedule.push({ id: null, time: `${istTime(room.startedAt)} – live`, what: `Live room — ${room.topic}`, kind: "live", customer: null });
  schedule.sort((x, y) => x.time.localeCompare(y.time));
  const barDays = [...byDay.keys()];

  res.json({
    dashboard: {
      dateLine: `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} · all times IST`,
      todayEarnings: today,
      earningsDelta: yesterday > 0 ? `${today >= yesterday ? "+" : "−"}${Math.round(Math.abs(today - yesterday) / yesterday * 100)}% vs yesterday` : "first earnings this week",
      sessions: todayLines.filter((l) => l.kind !== "adjustment" && l.kind !== "gift").length,
      emergencySessions: todayLines.filter((l) => l.kind === "emergency").length,
      gifts: todayLines.reduce((s, l) => s + l.gifts, 0),
      schedule,
      earningsBars: days.map((d) => Math.round((d / best) * 100)),
      earningsFrom: istDayMonth(new Date(barDays[0] + "T00:00:00Z")),
      earningsTo: istDayMonth(new Date(barDays[barDays.length - 1] + "T00:00:00Z")),
      training: training.map((t) => ({
        label: t.label,
        done: t.done,
        due: t.done ? "Complete" : t.dueAt ? `Due in ${Math.max(0, Math.ceil((t.dueAt.getTime() - now.getTime()) / 86400000))} days` : "Due soon",
      })),
      reviews: reviews.map((r) => ({ stars: r.stars, when: istDayMonth(r.createdAt), text: r.text })),
      multiplierOptions: MULTIPLIER_OPTIONS.filter((m) => m <= maxMultiplier),
      /** Welcome campaign: free calls taken today and how many are left. */
      freeCalls: await freeCallsView(a),
    },
  });
});

/**
 * Online / offline toggle. Going online makes the astrologer bookable straight away; going
 * offline ends their live room (if live) and times out requests still waiting for them.
 */
portalRouter.patch("/presence", async (req, res) => {
  const a = await me(req);
  const { online } = z.object({ online: z.boolean() }).parse(req.body);
  if (online && !canWork(a)) throw forbidden(a.suspension !== "none" ? "Blocked — account suspended." : "Blocked — your account isn't active yet.");
  let presence: string;
  if (online) {
    presence = await goOnline(a.id);
  } else {
    const { endedLive } = await goOffline(a.id);
    if (endedLive) await audit(req.auth ?? null, "live.end", a.id, "LIVE → ended · went offline");
    presence = "OFF";
  }
  res.json({ online: presence !== "OFF", presence: presence.toLowerCase() });
});

/**
 * Sent every ~45 s while any portal page is open. Keeps an online astrologer online; after
 * a few minutes without it they are switched offline (lib/presence.ts). It never brings an
 * offline astrologer back online — that is always the astrologer's own choice.
 * The portal sends the astrologer id it was opened for: if this browser has since signed in as
 * another astrologer, the beat is refused (403) instead of keeping the wrong person online.
 */
portalRouter.post("/heartbeat", async (req, res) => {
  const a = await me(req);
  const expected = (req.body as { astrologerId?: unknown } | undefined)?.astrologerId;
  if (typeof expected === "string" && expected !== a.id) throw forbidden("This browser is now signed in as a different astrologer.");
  const stored = await markSeen(a.id);
  const presence = canWork(a) ? stored : "OFF";
  res.json({ online: presence !== "OFF", presence: presence.toLowerCase() });
});

portalRouter.patch("/multiplier", async (req, res) => {
  const a = await me(req);
  const { multiplier } = z.object({ multiplier: z.number() }).parse(req.body);
  const max = await configNumber("consult.emergency.max_multiplier", 4);
  if (!MULTIPLIER_OPTIONS.includes(multiplier) || multiplier > max) throw badRequest(`Choose a multiplier between 1.5× and ${max}×.`);
  await db.astrologer.update({ where: { id: a.id }, data: { instantMultiplier: multiplier } });
  await audit(req.auth ?? null, "astrologer.multiplier.update", a.id, `${a.instantMultiplier}× → ${multiplier}×`);
  res.json({ instantMultiplier: multiplier, instantRate: instantRate(a.price, multiplier) });
});

// ── Application wizard ──

/** The wizard can be edited before it goes to HR, and again when HR asks for more information. */
const EDITABLE = ["draft", "docs"];

async function applicationContext(a: Astrologer) {
  const [draft, user, pendingBio, applicant] = await Promise.all([
    db.applicationDraft.findUnique({ where: { astrologerId: a.id } }),
    a.userId ? db.user.findUnique({ where: { id: a.userId }, select: { phone: true, email: true } }) : null,
    db.profileSubmission.count({ where: { astrologerId: a.id, status: "PENDING" } }),
    db.applicant.findUnique({ where: { astrologerId: a.id }, select: { id: true } }),
  ]);
  const values = draftValues(draft?.values);
  const known = { phone: user?.phone ?? null, email: user?.email ?? null };
  // "docs" is only editable when it's an application this portal sent (HR waits for the update).
  const editable = a.lifecycle === "draft" || (a.lifecycle === "docs" && applicant !== null);
  return { draft, values, known, editable, missing: missingFor(values, a, known, a.about.trim().length > 0 || pendingBio > 0) };
}

portalRouter.get("/application", async (req, res) => {
  const a = await me(req);
  const { draft, values, known, editable, missing } = await applicationContext(a);
  res.json({
    application: {
      currentStep: draft?.currentStep ?? 0,
      values: wizardValues(values),
      lastSaved: draft ? `Auto-saved ${istTime(draft.savedAt)}` : "Not saved yet",
      // What the platform already knows, used to pre-fill the wizard.
      known: {
        phone: known.phone,
        email: known.email,
        languages: a.languages,
        years: a.years,
        skills: a.skills,
        price: a.price,
        videoRate: a.price + VIDEO_PREMIUM,
      },
      // What still stops it going to HR (empty = ready), and where it stands once sent.
      missing,
      editable,
      submittedOn: submittedOn(values),
      note: values[META.note] ?? null,
    },
  });
});

portalRouter.put("/application", async (req, res) => {
  const a = await me(req);
  const { currentStep, values } = z
    .object({ currentStep: z.number().int().min(0).max(12), values: z.record(z.string(), z.string().max(2000)) })
    .parse(req.body);
  if (!(await applicationContext(a)).editable) throw conflict("Your application is with HR, so it can't be changed now.");
  const existing = await db.applicationDraft.findUnique({ where: { astrologerId: a.id } });
  // The platform's own "_" keys (submitted date, HR's note) are kept; the wizard can't write them.
  const merged = { ...wizardValues(values), ...metaValues(draftValues(existing?.values)) };
  const saved = await db.applicationDraft.upsert({
    where: { astrologerId: a.id },
    create: { astrologerId: a.id, currentStep, values: merged, savedAt: new Date() },
    update: { currentStep, values: merged, savedAt: new Date() },
  });
  res.json({ lastSaved: `Auto-saved ${istTime(saved.savedAt)}` });
});

/**
 * Sends the application to HR. From "draft" it creates the HR application (APP-NNNN, "Under review");
 * from "docs" (HR asked for more information) it sends the updated answers back to "Under review".
 * Repeating it once it is with HR (a double click) changes nothing.
 */
portalRouter.post("/application/submit", async (req, res) => {
  const a = await me(req);
  if (a.lifecycle === "active") throw conflict("Your application has already been approved.");
  if (a.lifecycle === "rejected") throw conflict("This application was not approved, so it can't be sent again.");
  if (!EDITABLE.includes(a.lifecycle)) return res.json({ lifecycle: a.lifecycle, alreadySubmitted: true });

  const { values, missing, editable } = await applicationContext(a);
  if (!editable) throw conflict("HR isn't waiting for an update on this application. They'll contact you if anything is needed.");
  if (missing.length) {
    throw badRequest(`Finish these before you submit: ${missing.map((m) => `${m.label} (step ${m.step + 1})`).join("; ")}.`);
  }

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    // One submission at a time, so two clicks can't both create an application or share an id.
    await lockKey(tx, "applicant:create");
    const fresh = await tx.astrologer.findUniqueOrThrow({ where: { id: a.id }, select: { lifecycle: true } });
    if (!EDITABLE.includes(fresh.lifecycle)) return { lifecycle: fresh.lifecycle, applicantId: null, resubmitted: false };
    const existing = await tx.applicant.findUnique({ where: { astrologerId: a.id } });
    let applicantId: string;
    if (fresh.lifecycle === "docs") {
      if (!existing) throw conflict("HR isn't waiting for an update on this application. They'll contact you if anything is needed.");
      await tx.applicant.update({ where: { id: existing.id }, data: { state: "Under review", version: { increment: 1 } } });
      applicantId = existing.id;
    } else {
      if (existing) throw conflict("Your application is already with HR.");
      applicantId = await nextApplicantId(tx);
      await tx.applicant.create({
        data: { id: applicantId, astrologerId: a.id, name: a.name, skill: a.skills[0] ?? "—", state: "Under review", submittedAt: now },
      });
    }
    await tx.astrologer.update({ where: { id: a.id }, data: { lifecycle: "review" } });
    // HR's note has been answered; the first submission date stays.
    const next: Record<string, string> = { ...values, [META.submittedAt]: values[META.submittedAt] ?? now.toISOString() };
    delete next[META.note];
    delete next[META.noteAt];
    await tx.applicationDraft.update({ where: { astrologerId: a.id }, data: { values: next, savedAt: now } });
    return { lifecycle: "review", applicantId, resubmitted: fresh.lifecycle === "docs" };
  });
  if (!result.applicantId) return res.json({ lifecycle: result.lifecycle, alreadySubmitted: true });
  await audit(
    req.auth ?? null,
    result.resubmitted ? "application.resubmit" : "application.submit",
    result.applicantId,
    `${result.resubmitted ? "Docs pending" : "Draft"} → Under review · ${a.id}`,
  );
  res.status(201).json({ lifecycle: result.lifecycle, alreadySubmitted: false, applicationId: result.applicantId });
});

// ── Availability ──

function weekOf(dateKey: string): string[] {
  const d = new Date(dateKey + "T00:00:00Z");
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000).toISOString().slice(0, 10));
}

portalRouter.get("/availability", async (req, res) => {
  const a = await me(req);
  const todayKey = istDateKey(new Date());
  const anchor = typeof req.query.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.week) ? req.query.week : todayKey;
  const days = weekOf(anchor);
  const slots = await db.availabilitySlot.findMany({
    where: { astrologerId: a.id, date: { gte: new Date(days[0] + "T00:00:00Z"), lte: new Date(days[6] + "T00:00:00Z") } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
    include: { customer: true },
  });
  const first = new Date(days[0] + "T00:00:00Z");
  const last = new Date(days[6] + "T00:00:00Z");
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  const monthYear = last.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  res.json({
    availability: {
      weekLabel: sameMonth
        ? `${first.getUTCDate()}–${last.getUTCDate()} ${monthYear} · IST`
        : `${istDayMonth(first)} – ${istDayMonth(last)} ${last.getUTCFullYear()} · IST`,
      days: days.map(weekdayLabel),
      dayKeys: days,
      today: weekdayLabel(todayKey),
      hours: HOURS,
      slots: slots.map((s) => ({
        id: s.id,
        day: weekdayLabel(s.date.toISOString().slice(0, 10)),
        date: s.date.toISOString().slice(0, 10),
        start: s.start,
        end: s.end,
        state: s.state.toLowerCase(),
        detail: s.detail,
        customerName: s.state === "BOOKED" && s.customer ? messageSummary(s.customer).name : null,
      })),
      bookedDetail: "Booked session. Cancelling needs a reason.",
    },
  });
});

portalRouter.post("/availability", async (req, res) => {
  const a = await me(req);
  const { date, start, end } = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start and an end time."),
      end: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start and an end time."),
    })
    .parse(req.body);
  if (end <= start) throw badRequest("End time must be after start time.");
  const day = new Date(date + "T00:00:00Z");
  if (await slotClash(a.id, day, start, end)) throw conflict(`That range overlaps a slot you already have on ${weekdayLabel(date)}.`);
  const slot = await db.availabilitySlot.create({ data: { astrologerId: a.id, date: day, start, end, state: "OPEN" } });
  res.status(201).json({ slot: { id: slot.id, day: weekdayLabel(date), date, start, end, state: "open" } });
});

portalRouter.post("/availability/:id/cancel", async (req, res) => {
  const a = await me(req);
  const slot = await db.availabilitySlot.findUnique({ where: { id: String(req.params.id) } });
  if (!slot || slot.astrologerId !== a.id) throw notFound("Slot not found.");
  if (slot.state === "BOOKED") throw conflict("This slot is booked. Cancelling a booking needs a reason — contact support.");
  if (slot.state === "CANCELLED") return res.json({ ok: true });
  await db.availabilitySlot.update({ where: { id: slot.id }, data: { state: "CANCELLED" } });
  res.json({ ok: true });
});

/** Opens a cancelled slot again, if it hasn't started yet and no live slot now overlaps it. */
portalRouter.post("/availability/:id/reopen", async (req, res) => {
  const a = await me(req);
  const slot = await db.availabilitySlot.findUnique({ where: { id: String(req.params.id) } });
  if (!slot || slot.astrologerId !== a.id) throw notFound("Slot not found.");
  if (slot.state === "OPEN") return res.json({ ok: true });
  if (slot.state !== "CANCELLED") throw conflict("Only a cancelled slot can be opened again.");
  const dateKey = slot.date.toISOString().slice(0, 10);
  // Slot times are IST.
  if (new Date(`${dateKey}T${slot.start}:00+05:30`).getTime() <= Date.now()) {
    throw conflict("This slot has already started or passed, so it can't be opened again. Add a new slot instead.");
  }
  if (await slotClash(a.id, slot.date, slot.start, slot.end, slot.id)) {
    throw conflict(`Another slot on ${weekdayLabel(dateKey)} now overlaps ${slot.start}–${slot.end}. Remove it first or add a different time.`);
  }
  const { count } = await db.availabilitySlot.updateMany({ where: { id: slot.id, state: "CANCELLED" }, data: { state: "OPEN", customerId: null, detail: null } });
  if (!count) throw conflict("This slot just changed. Refresh and try again.");
  res.json({ ok: true });
});

/** A live (open or booked) slot of this astrologer's that overlaps start–end on the day, if any. */
function slotClash(astrologerId: string, day: Date, start: string, end: string, exceptId?: string) {
  return db.availabilitySlot.findFirst({
    where: { astrologerId, date: day, state: { not: "CANCELLED" }, start: { lt: end }, end: { gt: start }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
}

// ── Consultations ──

const MODE_LABEL: Record<string, string> = { CHAT: "Chat", VOICE: "Voice", VIDEO: "Video" };
const modeLabel = (c: { kind: string; mode: string }) => (c.kind === "INSTANT" ? "Instant Call" : MODE_LABEL[c.mode] ?? c.mode);

portalRouter.get("/consultations", async (req, res) => {
  const a = await me(req);
  await expireStaleRequests(a.id);
  const now = new Date();
  const [requests, active, queueMax, standardFree, freeCalls] = await Promise.all([
    db.consultation.findMany({ where: { astrologerId: a.id, status: "REQUESTED" }, orderBy: { requestedAt: "asc" }, include: { customer: true } }),
    db.consultation.findFirst({ where: { astrologerId: a.id, status: "ACTIVE" }, orderBy: { connectedAt: "desc" }, include: { customer: true } }),
    configNumber("live.queue.max_depth", 20),
    configNumber("consult.free_seconds", 60),
    freeCallsView(a),
  ]);
  const first = requests[0];
  let session = null;
  if (active?.connectedAt) {
    const secs = Math.floor((now.getTime() - active.connectedAt.getTime()) / 1000);
    const wallet = active.customerId ? await db.wallet.findUnique({ where: { userId: active.customerId } }) : null;
    // Seconds the session can still run (free time plus what the customer's held balance pays for).
    const cap = sessionCapSeconds(active, standardFree);
    const free = active.billingMode === COMPLIMENTARY;
    session = {
      id: active.id,
      alias: active.customerAlias,
      mode: modeLabel(active),
      instant: active.kind === "INSTANT",
      /** A welcome free call: the first freeSeconds earn nothing; paid minutes after it earn as usual. */
      free,
      freeSeconds: free ? active.complimentarySeconds : 0,
      elapsed: `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
      elapsedSeconds: secs,
      // Two minutes or less of what the balance pays for (not the 15-minute cap).
      lowBalance: cap < MAX_SESSION_SECONDS && cap - secs <= 120,
      hasWallet: !!wallet,
      profile: active.customer ? consultSummary(active.customer) : null,
    };
  }
  res.json({
    consultations: {
      incoming: first
        ? {
            id: first.id,
            alias: first.customerAlias,
            mode: modeLabel(first),
            instant: first.kind === "INSTANT",
            free: first.billingMode === COMPLIMENTARY,
            windowSecs: INCOMING_WINDOW_SECS,
            remainingSecs: Math.max(0, INCOMING_WINDOW_SECS - Math.floor((now.getTime() - (first.offeredAt ?? now).getTime()) / 1000)),
            rate: first.rate,
            profile: first.customer ? consultSummary(first.customer) : null,
          }
        : null,
      // Everyone waiting, oldest first, with the profile summary only this astrologer may see.
      queue: requests.map((r) => ({
        id: r.id,
        alias: r.customerAlias,
        mode: modeLabel(r),
        instant: r.kind === "INSTANT",
        free: r.billingMode === COMPLIMENTARY,
        rate: r.rate,
        waiting: waitedFor(r.requestedAt, now),
        profile: r.customer ? consultSummary(r.customer) : null,
      })),
      queueMax,
      session,
      freeCalls,
    },
  });
});

/**
 * Full profile of a customer who asked this astrologer for a consultation (tapping a row in
 * "Incoming"). Only while the request is waiting or the session is in progress.
 */
portalRouter.get("/consultations/:id/profile", async (req, res) => {
  const a = await me(req);
  const c = await db.consultation.findUnique({ where: { id: String(req.params.id) }, include: { customer: true } });
  if (!c || c.astrologerId !== a.id || !["REQUESTED", "ACTIVE"].includes(c.status)) {
    throw notFound("This request is no longer waiting.");
  }
  res.json({
    person: {
      id: c.id,
      alias: c.customerAlias,
      mode: modeLabel(c),
      instant: c.kind === "INSTANT",
      free: c.billingMode === COMPLIMENTARY,
      rate: c.rate,
      status: c.status === "ACTIVE" ? "active" : "waiting",
      waiting: waitedFor(c.requestedAt, new Date()),
      profile: c.customer ? queueProfile(c.customer) : null,
    },
  });
});

portalRouter.post("/consultations/:id/accept", async (req, res) => {
  const a = await me(req);
  if (!canWork(a)) throw forbidden("Your account can't take new sessions right now.");
  const result = await acceptConsultation(String(req.params.id), a.id);
  if (!result.ok) {
    if (result.reason === "busy") throw conflict("Only one active consult at a time. End your current session first.");
    throw conflict("This request is no longer waiting — the customer may have cancelled it.");
  }
  res.json({ ok: true, rate: result.consultation.rate });
});

portalRouter.post("/consultations/:id/reject", async (req, res) => {
  const a = await me(req);
  const c = await db.consultation.findUnique({ where: { id: String(req.params.id) } });
  if (!c || c.astrologerId !== a.id) throw notFound("Request not found.");
  const { count } = await db.consultation.updateMany({ where: { id: c.id, status: "REQUESTED" }, data: { status: "REJECTED", endedAt: new Date() } });
  if (!count) throw conflict("This request is no longer waiting.");
  // Declined: a free call held for it is the customer's again.
  if (c.billingMode === COMPLIMENTARY) await releaseWelcome(db, c.id);
  res.json({ ok: true });
});

portalRouter.post("/consultations/:id/end", async (req, res) => {
  const a = await me(req);
  const c = await db.consultation.findUnique({ where: { id: String(req.params.id) } });
  if (!c || c.astrologerId !== a.id) throw notFound("Session not found.");
  const ended = await endConsultation(c, "astrologer");
  res.json({ settlement: settlementView(ended) });
});

// ── Live room console ──

portalRouter.get("/live", async (req, res) => {
  const a = await me(req);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room) return res.json({ room: null });
  const [entries, announcements, categories] = await Promise.all([
    db.liveQueueEntry.findMany({ where: { roomId: room.id, status: "WAITING" }, orderBy: { createdAt: "asc" }, include: { user: true } }),
    db.liveAnnouncement.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: MAX_ANNOUNCEMENTS_SHOWN }),
    liveCategories(),
  ]);
  const now = new Date();
  const secs = Math.max(0, Math.floor((Date.now() - room.startedAt.getTime()) / 1000));
  res.json({
    room: {
      id: room.id,
      isLive: room.isLive,
      // This live's details (when not live: the last ones used, to pre-fill "Go live").
      title: room.title,
      topic: room.topic,
      category: room.category,
      language: room.language,
      durationMins: room.durationMins,
      startedAt: room.startedAt.toISOString(),
      // What the details may be set to.
      categories,
      languages: a.languages,
      elapsed: `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
      viewers: room.isLive ? viewerCount(room.id) : 0,
      image: room.thumb,
      requests: entries.slice(0, 3).map((e, i) => ({ id: e.id, alias: e.alias, kind: e.mode === "PUBLIC" ? "stage" : "private", actionable: i < 2 })),
      waiting: entries.length,
      pollQuestion: room.pollQuestion,
      pollOptions: room.pollOptions,
      rate: a.price,
      announcements: announcements.map(announcementView),
      // Who is waiting, with the profile summary only this astrologer may see.
      queue: entries.map((e) => ({
        id: e.id,
        alias: e.alias,
        mode: e.mode === "PUBLIC" ? "public" : "private",
        waiting: waitedFor(e.createdAt, now),
        profile: e.user ? queueSummary(e.user) : null,
      })),
    },
  });
});

/**
 * Go live: opens the astrologer's room to customers with a topic. Only while online and not
 * in a consultation; one room per astrologer, so one live at a time. Starts a fresh session:
 * the viewer count, chat shown and poll votes begin again from zero.
 */
portalRouter.post("/live/start", async (req, res) => {
  const a = await me(req);
  // The portal always sends every detail. The title defaults to the topic, and the other
  // details may be left out by older API clients; whatever is sent is checked.
  const { topic, ...rest } = detailsSchema(await liveCategories(), a.languages)
    .partial({ title: true, category: true, language: true, durationMins: true })
    .parse(req.body);
  const details = { topic, title: rest.title ?? topic, category: rest.category ?? null, language: rest.language ?? null, durationMins: rest.durationMins ?? null };
  if (!canWork(a)) throw forbidden(a.suspension !== "none" ? "Blocked — account suspended." : "Blocked — your account isn't active yet.");
  checkDetailsText(details);
  const presence = effectivePresence(a);
  if (presence === "OFF") throw conflict("Go online first — you can go live only while you're online.");
  if (presence === "BUSY") throw conflict("Finish your current consultation before going live.");
  await expireStaleRequests(a.id);
  const waiting = await db.consultation.count({ where: { astrologerId: a.id, status: "REQUESTED" } });
  if (waiting) throw conflict(`${waiting === 1 ? "A customer is" : `${waiting} customers are`} waiting for you in Consultations — accept or decline first, then go live.`);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room) throw notFound("You don't have a live room yet.");
  if (room.isLive) return res.json({ ok: true, alreadyLive: true });

  const now = new Date();
  const started = await db.$transaction(async (tx) => {
    const { count } = await tx.liveRoom.updateMany({
      where: { id: room.id, isLive: false },
      data: { isLive: true, startedAt: now, ...details, viewers: 0, state: "normal", pollCounts: room.pollOptions.map(() => 0) },
    });
    if (!count) return false;
    await tx.pollVote.deleteMany({ where: { roomId: room.id } });
    await tx.liveQueueEntry.updateMany({ where: { roomId: room.id, status: "WAITING" }, data: { status: "LEFT" } });
    await tx.astrologer.updateMany({ where: { id: a.id, presence: { not: "OFF" } }, data: { presence: "LIVE", lastSeenAt: now } });
    return true;
  });
  if (started) await audit(req.auth ?? null, "live.start", room.id, `OFF → LIVE · ${details.title}${details.title !== topic ? ` (${topic})` : ""}`);
  res.status(started ? 201 : 200).json({ ok: true, alreadyLive: !started });
});

/** Edit this live's details without ending it. Viewers see the change on their next refresh. */
portalRouter.patch("/live", async (req, res) => {
  const a = await me(req);
  const patch = detailsSchema(await liveCategories(), a.languages).partial().parse(req.body);
  if (!Object.keys(patch).length) throw badRequest("Nothing to change.");
  checkDetailsText(patch);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room) throw notFound("You don't have a live room yet.");
  const before = { title: room.title || room.topic, topic: room.topic, category: room.category ?? undefined, language: room.language ?? undefined, durationMins: room.durationMins ?? undefined };
  const diff = detailsDiff(before, patch);
  if (!diff) return res.json({ ok: true, changed: false });
  // Only the live session in progress can be edited; going live sets the details afresh.
  const { count } = await db.liveRoom.updateMany({ where: { id: room.id, isLive: true }, data: patch });
  if (!count) throw conflict("You're not live right now. Set the details when you go live.");
  await audit(req.auth ?? null, "live.update", room.id, diff);
  res.json({ ok: true, changed: true });
});

/**
 * What is happening in the room right now, for the console's video overlay: the feed (messages,
 * joins, gifts), recent gifts to animate, gift totals this session and the viewer count.
 * The console polls this every few seconds while live.
 */
portalRouter.get("/live/feed", async (req, res) => {
  const a = await me(req);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room?.isLive) return res.json({ feed: null });
  const [feed, totals] = await Promise.all([
    sessionFeed(room),
    db.giftSend.aggregate({ where: { roomId: room.id, createdAt: { gte: room.startedAt } }, _sum: { price: true }, _count: true }),
  ]);
  res.json({
    feed: {
      ...feed,
      viewers: viewerCount(room.id),
      giftsTotal: totals._sum.price ?? 0,
      giftsCount: totals._count,
      title: room.title || room.topic,
    },
  });
});

/** End live: the room closes for viewers, people still waiting leave the queue, and the astrologer is back to Available. */
portalRouter.post("/live/end", async (req, res) => {
  const a = await me(req);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id }, select: { id: true } });
  if (!room) throw notFound("You don't have a live room yet.");
  const ended = await endLiveRoom(a.id);
  const presence = (await syncPresence(a.id)) ?? "OFF";
  if (ended) await audit(req.auth ?? null, "live.end", room.id, "LIVE → ended");
  res.json({ ok: true, ended, presence: presence.toLowerCase() });
});

/**
 * Full profile of someone in this astrologer's live queue ("See more"). Only for entries in
 * the astrologer's own room that are still waiting or were accepted; anything else is "not found".
 */
portalRouter.get("/live/queue/:entryId/profile", async (req, res) => {
  const a = await me(req);
  const entry = await db.liveQueueEntry.findUnique({ where: { id: String(req.params.entryId) }, include: { room: true, user: true } });
  if (!entry || entry.room.astrologerId !== a.id || !["WAITING", "ACCEPTED"].includes(entry.status)) {
    throw notFound("This person is no longer in your queue.");
  }
  res.json({
    person: {
      id: entry.id,
      alias: entry.alias,
      mode: entry.mode === "PUBLIC" ? "public" : "private",
      status: entry.status.toLowerCase(),
      waiting: waitedFor(entry.createdAt, new Date()),
      profile: entry.user ? queueProfile(entry.user) : null,
    },
  });
});

/** "12 min", or "under a minute" for someone who just joined. */
function waitedFor(since: Date, now: Date): string {
  const label = ageLabel(since, now, "long");
  return label === "0 min" ? "under a minute" : label;
}

// Announcements: short notes the astrologer posts to the room, shown above the room chat.

const MAX_ANNOUNCEMENTS_SHOWN = 20;

function announcementView(n: { id: string; text: string; createdAt: Date }) {
  return { id: n.id, text: n.text, at: istTime(n.createdAt), date: istDayMonth(n.createdAt) };
}

portalRouter.post("/live/announcements", async (req, res) => {
  const a = await me(req);
  const { text } = z
    .object({ text: z.string().trim().min(1, "Write an announcement first.").max(280, "Announcements can be up to 280 characters.") })
    .parse(req.body);
  rateLimit(`announce:${a.id}`, 5, 60_000, "You're posting announcements too quickly. Wait a minute.");
  if (containsContactDetails(text)) throw badRequest(CONTACT_BLOCKED_NOTICE);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room) throw notFound("You don't have a live room.");
  const created = await db.liveAnnouncement.create({ data: { roomId: room.id, text } });
  res.status(201).json({ announcement: announcementView(created) });
});

portalRouter.delete("/live/announcements/:id", async (req, res) => {
  const a = await me(req);
  const n = await db.liveAnnouncement.findUnique({ where: { id: String(req.params.id) }, include: { room: true } });
  if (!n || n.room.astrologerId !== a.id) throw notFound("Announcement not found.");
  await db.liveAnnouncement.deleteMany({ where: { id: n.id } });
  res.json({ ok: true });
});

portalRouter.post("/live/requests/:id/:decision", async (req, res) => {
  const a = await me(req);
  const decision = z.enum(["accept", "decline"]).parse(req.params.decision);
  const entry = await db.liveQueueEntry.findUnique({ where: { id: String(req.params.id) }, include: { room: true } });
  if (!entry || entry.room.astrologerId !== a.id) throw notFound("Request not found.");
  if (entry.status !== "WAITING") throw conflict("This request is no longer waiting.");
  await db.liveQueueEntry.update({ where: { id: entry.id }, data: { status: decision === "accept" ? "ACCEPTED" : "DECLINED" } });
  res.json({ ok: true, rate: a.price });
});

portalRouter.post("/live/poll", async (req, res) => {
  const a = await me(req);
  const { question, options } = z
    .object({ question: z.string().trim().min(3).max(140), options: z.array(z.string().trim().min(1).max(80)).min(2).max(6) })
    .parse(req.body);
  const room = await db.liveRoom.findUnique({ where: { astrologerId: a.id } });
  if (!room) throw notFound("You don't have a live room.");
  await db.$transaction([
    db.pollVote.deleteMany({ where: { roomId: room.id } }),
    db.liveRoom.update({ where: { id: room.id }, data: { pollQuestion: question, pollOptions: options, pollCounts: options.map(() => 0) } }),
  ]);
  res.json({ ok: true });
});

// ── Messages ──

// Conversations with customers. The astrologer sees each customer's real name, and on request
// their profile, only for customers in their own conversations. Conversations the Astrorize
// team started with the astrologer are in the same list (kind "team").
portalRouter.get("/messages", async (req, res) => {
  const a = await me(req);
  const userId = (req.auth as AuthContext).user.id;
  const [threads, team] = await Promise.all([
    db.messageThread.findMany({
      where: { astrologerId: a.id },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } }, customer: true },
    }),
    teamConversations(userId, "astrologer"),
  ]);
  // Team conversations come with their messages too, so the page can show any of them at once.
  const teamThreads = await Promise.all(
    team.map(async (t) => ({
      kind: "team" as const,
      ...t,
      messages: teamThreadView(await directThreadFor(t.id, userId, false), userId, "astrologer").messages,
    })),
  );
  const customerThreads = threads.map((t) => {
    const last = lastDelivered(t.messages);
    return {
      kind: "customer" as const,
      id: t.id,
      alias: t.customerAlias,
      customer: t.customer ? messageSummary(t.customer) : null,
      preview: last?.text.slice(0, 80) ?? "",
      lastAt: (last ?? t.messages.at(-1))?.createdAt.toISOString() ?? null,
      // The customer wrote last: waiting for the astrologer's reply.
      awaitingReply: last?.sender === "CUSTOMER",
      messages: t.messages.filter(visibleTo("ASTROLOGER")).map((m) => messageView(m, "ASTROLOGER")),
    };
  });
  // One list, latest activity first.
  const all = [...teamThreads, ...customerThreads].sort((x, y) => (y.lastAt ?? "").localeCompare(x.lastAt ?? ""));
  res.json({ threads: all });
});

/** Reply in a conversation the Astrorize team started. */
portalRouter.post("/team-messages/:id", async (req, res) => {
  await me(req);
  const { text } = z.object({ text: directText }).parse(req.body);
  res.status(201).json({ message: await replyDirect(String(req.params.id), (req.auth as AuthContext).user.id, text) });
});

/** The astrologer opened a team conversation: its messages count as read. */
portalRouter.post("/team-messages/:id/read", async (req, res) => {
  await me(req);
  await directThreadFor(String(req.params.id), (req.auth as AuthContext).user.id, true);
  res.json({ ok: true });
});

/** Full profile of the customer in one of this astrologer's conversations, with their history together. */
/** Who booked one of this astrologer's slots, for the schedule's details popup. Own bookings only. */
portalRouter.get("/schedule/:slotId", async (req, res) => {
  const a = await me(req);
  const slot = await db.availabilitySlot.findUnique({ where: { id: String(req.params.slotId) }, include: { customer: true } });
  if (!slot || slot.astrologerId !== a.id || slot.state !== "BOOKED" || !slot.customer) throw notFound("Booking not found.");
  res.json({
    person: {
      alias: "",
      profile: queueProfile(slot.customer),
      history: await historyWith(slot.customer.id, a.id),
      slot: { date: istDate(slot.date), start: slot.start, end: slot.end, detail: slot.detail ?? "Booked session" },
    },
  });
});

portalRouter.get("/messages/:threadId/customer", async (req, res) => {
  const a = await me(req);
  const thread = await db.messageThread.findUnique({ where: { id: String(req.params.threadId) }, include: { customer: true } });
  if (!thread || thread.astrologerId !== a.id || !thread.customer) throw notFound("Customer not found.");
  res.json({
    person: {
      alias: thread.customerAlias,
      profile: queueProfile(thread.customer),
      history: await historyWith(thread.customer.id, a.id),
    },
  });
});

portalRouter.post("/messages/:threadId", async (req, res) => {
  const a = await me(req);
  const { text } = z.object({ text: messageText }).parse(req.body);
  const thread = await db.messageThread.findUnique({ where: { id: String(req.params.threadId) } });
  if (!thread || thread.astrologerId !== a.id) throw notFound("Conversation not found.");
  checkSendRate((req.auth as AuthContext).user.id);
  res.status(201).json(await postMessage(thread.id, "ASTROLOGER", text));
});

// ── Earnings ──

/** Half-month statement periods, newest first: 1–15 and 16–end of month (IST). */
function periods(count: number) {
  const now = new Date(istDateKey(new Date()) + "T00:00:00Z");
  const out: { from: Date; to: Date; label: string }[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  let firstHalf = now.getUTCDate() <= 15;
  for (let i = 0; i < count; i++) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const from = new Date(Date.UTC(y, m, firstHalf ? 1 : 16));
    const to = new Date(Date.UTC(y, m, firstHalf ? 15 : lastDay, 23, 59, 59));
    const mon = from.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).slice(0, 3);
    out.push({ from, to, label: `${from.getUTCDate()}–${to.getUTCDate()} ${mon} ${y}` });
    if (firstHalf) {
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }
    firstHalf = !firstHalf;
  }
  return out;
}

portalRouter.get("/earnings", async (req, res) => {
  const a = await me(req);
  const list = periods(3);
  const index = Math.min(2, Math.max(0, Number(req.query.period ?? 0) || 0));
  const p = list[index]!;
  const [lines, paused] = await Promise.all([
    db.earningsLine.findMany({ where: { astrologerId: a.id, date: { gte: p.from, lte: p.to } }, orderBy: { date: "desc" } }),
    getSetting<Record<string, boolean>>("payout.paused", {}),
  ]);
  // Next payout: the end of the current half-month.
  const next = list[0]!.to;
  const rates = await sessionRates(a.id, lines);
  res.json({
    earnings: {
      periodLabel: `${p.label} · your share only`,
      periods: list.map((x) => x.label),
      periodIndex: index,
      gross: lines.reduce((s, l) => s + lineAmount(a, l, rates), 0),
      gifts: lines.reduce((s, l) => s + l.gifts, 0),
      tdsRate: 0.05,
      nextPayout: istDayMonth(next),
      payoutPaused: !!paused[a.id],
      statement: lines.map((l) => ({
        date: istDayMonth(l.date),
        session: l.sessionRef,
        kind: l.kind,
        mode: l.mode,
        minutes: l.minutes,
        gifts: l.gifts,
        amount: lineAmount(a, l, rates),
      })),
    },
  });
});

// ── Profile ──

portalRouter.get("/profile", async (req, res) => {
  const a = await me(req);
  const pending = await db.profileSubmission.findMany({ where: { astrologerId: a.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  res.json({
    profile: {
      pendingChanges: pending.length,
      skillPool: SKILL_POOL,
      // The intro video on the public profile (published at once, no review), and its limits.
      introVideoUrl: a.introVideoUrl,
      video: { maxMb: MAX_VIDEO_BYTES / (1024 * 1024), maxSeconds: MAX_VIDEO_SECONDS },
      // Only astrologers listed on the site have a public profile (same rule as the directory).
      publicProfileUrl: a.lifecycle === "active" && a.suspension !== "full" ? `/astrologer/${a.slug}` : null,
      published: { bio: a.about, skills: a.skills },
      draft: pending[0] ? { bio: pending[0].bio, skills: pending[0].skills } : null,
    },
  });
});

/** Reads the raw video body; a file over the limit gets a clear message instead of a generic one. */
const readVideo = express.raw({ type: Object.keys(VIDEO_TYPES), limit: MAX_VIDEO_BYTES });
function videoBody(req: Request, res: Response, next: NextFunction) {
  readVideo(req, res, (err?: unknown) => {
    if ((err as { status?: number } | undefined)?.status === 413) return next(badRequest(`Intro videos can be up to ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`));
    next(err);
  });
}

/** Upload or replace the intro video (MP4 or WebM, up to 2 minutes). It shows on the public profile at once. */
portalRouter.post("/profile/video", videoBody, async (req, res) => {
  const a = await me(req);
  rateLimit(`video:${a.id}`, 10, 10 * 60 * 1000, "Too many video uploads. Try again in a few minutes.");
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Choose an MP4 or WebM video.");
  // Trust the file's own bytes, not the name or Content-Type the browser sent.
  const type = sniffVideo(body);
  if (!type) throw badRequest("That file isn't an MP4 or WebM video.");
  const seconds = videoDurationSeconds(body, type);
  if (seconds !== null && seconds > MAX_VIDEO_SECONDS + 0.5) {
    throw badRequest(`Your video is ${Math.round(seconds)} seconds long. Intro videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes.`);
  }
  const introVideoUrl = await saveVideo(body, type);
  try {
    await db.astrologer.update({ where: { id: a.id }, data: { introVideoUrl } });
  } catch (e) {
    await deleteMedia(introVideoUrl);
    throw e;
  }
  await deleteMedia(a.introVideoUrl);
  await audit(req.auth ?? null, "astrologer.intro_video.update", a.id, `${a.introVideoUrl ? "replaced" : "added"} · ${type} · ${(body.length / (1024 * 1024)).toFixed(1)} MB${seconds !== null ? ` · ${Math.round(seconds)} s` : ""}`);
  res.status(201).json({ introVideoUrl });
});

portalRouter.delete("/profile/video", async (req, res) => {
  const a = await me(req);
  if (!a.introVideoUrl) return res.json({ introVideoUrl: null });
  await db.astrologer.update({ where: { id: a.id }, data: { introVideoUrl: null } });
  await deleteMedia(a.introVideoUrl);
  await audit(req.auth ?? null, "astrologer.intro_video.remove", a.id, "removed");
  res.json({ introVideoUrl: null });
});

portalRouter.post("/profile/submission", async (req, res) => {
  const a = await me(req);
  const { bio, skills } = z
    .object({ bio: z.string().trim().min(20).max(3000), skills: z.array(z.string().min(1).max(40)).min(1).max(12) })
    .parse(req.body);
  if (/guarantee|100%|definitely|cure|certain/i.test(bio)) {
    throw badRequest("Your bio promises an outcome (e.g. “guarantee”, “100%”). Remove it before submitting.");
  }
  if (bio === a.about && skills.join("|") === a.skills.join("|")) throw badRequest("Nothing has changed since your last submission.");
  await db.profileSubmission.create({ data: { astrologerId: a.id, bio, skills } });
  const pendingChanges = await db.profileSubmission.count({ where: { astrologerId: a.id, status: "PENDING" } });
  res.status(201).json({ pendingChanges });
});

// ── Compliance ──

portalRouter.get("/compliance", async (req, res) => {
  const a = await me(req);
  const notice = await db.complianceNotice.findFirst({ where: { astrologerId: a.id }, orderBy: { issuedAt: "desc" } });
  const now = new Date();
  const left = notice ? Math.max(0, notice.respondBy.getTime() - now.getTime()) : 0;
  res.json({
    compliance: {
      notice: notice
        ? {
            id: notice.id,
            category: notice.category,
            respondIn: `${Math.floor(left / 86400000)}d ${Math.floor((left % 86400000) / 3600000)}h`,
            summary: notice.summary,
            status: notice.status,
            response: notice.response,
          }
        : null,
      steps: notice
        ? [
            { label: "Notice issued", when: istDayMonth(notice.issuedAt), reached: true },
            { label: "Respond window", when: `open until ${istDayMonth(notice.respondBy)}`, reached: true },
            { label: "Decision", when: notice.status === "DECIDED" ? "made" : "pending", reached: notice.status === "DECIDED" },
            { label: "Appeal", when: "if applicable", reached: false },
          ]
        : [],
      scopes: [
        { state: "Approved — Active", newSessions: "yes", goLive: "yes", earnings: "yes", respond: "yes" },
        { state: "Pricing pending approval", newSessions: "no", goLive: "no", earnings: "yes", respond: "yes" },
        { state: "Partial suspension", newSessions: "no", goLive: "no", earnings: "read", respond: "yes" },
        { state: "Full suspension", newSessions: "no", goLive: "no", earnings: "read", respond: "yes" },
      ],
      reapplyInDays: 68,
    },
  });
});

portalRouter.post("/compliance/:id/respond", async (req, res) => {
  const a = await me(req);
  const { text } = z.object({ text: z.string().trim().min(20, "Write at least a few sentences.").max(5000) }).parse(req.body);
  const notice = await db.complianceNotice.findUnique({ where: { id: String(req.params.id) } });
  if (!notice || notice.astrologerId !== a.id) throw notFound("Notice not found.");
  if (notice.respondBy < new Date()) throw conflict("The response window has closed.");
  await db.complianceNotice.update({ where: { id: notice.id }, data: { status: "RESPONDED", response: text, respondedAt: new Date() } });
  res.json({ ok: true, respondBy: istDate(notice.respondBy) });
});

/** An astrologer reports a customer or session. Creates a support ticket. */
portalRouter.post("/reports", async (req, res) => {
  const a = await me(req);
  const { subject, sessionRef } = z
    .object({ subject: z.string().trim().min(5).max(200), sessionRef: z.string().max(40).optional() })
    .parse(req.body);
  let id = makeRef("CMP", 4);
  while (await db.supportTicket.findUnique({ where: { id } })) id = makeRef("CMP", 4);
  await db.supportTicket.create({
    data: {
      id,
      subject: `${subject} (reported by ${a.name})`,
      state: "INVESTIGATING",
      slaDueAt: new Date(Date.now() + 3 * 86400000),
      customerAlias: "—",
      sessionRef: sessionRef ?? "—",
    },
  });
  res.status(201).json({ caseRef: id });
});
