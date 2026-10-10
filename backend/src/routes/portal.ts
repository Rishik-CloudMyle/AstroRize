import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "../lib/audit.ts";
import { VIDEO_PREMIUM, instantRate } from "../lib/billing.ts";
import { META, draftValues, metaValues, missingFor, nextApplicantId, submittedOn, wizardValues } from "../lib/application.ts";
import {
  INCOMING_WINDOW_SECS,
  acceptConsultation,
  endConsultation,
  expireStaleRequests,
  lockKey,
  settlementView,
} from "../lib/consultations.ts";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { ageLabel, istDate, istDateKey, istDayMonth, istTime, makeRef, weekdayLabel } from "../lib/format.ts";
import { consultSummary, queueProfile, queueSummary } from "../lib/profile.ts";
import { CONTACT_BLOCKED_NOTICE, containsContactDetails, rateLimit } from "../lib/safety.ts";
import { canWork, effectivePresence, endLiveRoom, goOffline, goOnline, markSeen, syncPresence, viewerCount } from "../lib/presence.ts";
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
  const [requests, threads, notices, draft, slaDays] = await Promise.all([
    db.consultation.count({ where: { astrologerId: a.id, status: "REQUESTED" } }),
    db.messageThread.findMany({ where: { astrologerId: a.id }, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } }),
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
        messages: threads.filter((t) => t.messages[0]?.sender === "CUSTOMER").length,
        compliance: notices,
      },
      online: effectivePresence(a) !== "OFF",
      /** on | busy | live | off */
      presence: effectivePresence(a).toLowerCase(),
    },
  });
});

/** Amount an earnings line is worth to the astrologer (₹), from their own rates. */
function lineAmount(a: Astrologer, l: Pick<EarningsLine, "kind" | "minutes">): number {
  const rate =
    l.kind === "video" ? a.price + VIDEO_PREMIUM : l.kind === "emergency" ? instantRate(a.price, a.instantMultiplier) : a.price;
  return l.kind === "adjustment" ? 0 : l.minutes * rate;
}

portalRouter.get("/dashboard", async (req, res) => {
  const a = await me(req);
  const now = new Date();
  const todayKey = istDateKey(now);
  const since = new Date(now.getTime() - 10 * 86400000);
  const [lines, slots, room, training, reviews, maxMultiplier] = await Promise.all([
    db.earningsLine.findMany({ where: { astrologerId: a.id, date: { gte: since } } }),
    db.availabilitySlot.findMany({ where: { astrologerId: a.id, date: new Date(todayKey + "T00:00:00Z"), state: { not: "CANCELLED" } }, orderBy: { start: "asc" } }),
    db.liveRoom.findUnique({ where: { astrologerId: a.id } }),
    db.trainingModule.findMany({ where: { astrologerId: a.id }, orderBy: { rank: "asc" } }),
    db.review.findMany({ where: { astrologerId: a.id, status: "VISIBLE" }, orderBy: { createdAt: "desc" }, take: 2 }),
    configNumber("consult.emergency.max_multiplier", 4),
  ]);

  // Earnings per day for the last 10 days (bar heights are a % of the best day).
  const byDay = new Map<string, number>();
  for (let i = 9; i >= 0; i--) byDay.set(istDateKey(new Date(now.getTime() - i * 86400000)), 0);
  for (const l of lines) {
    const k = istDateKey(l.date);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + lineAmount(a, l) + l.gifts);
  }
  const days = [...byDay.values()];
  const best = Math.max(1, ...days);
  const today = days[days.length - 1] ?? 0;
  const yesterday = days[days.length - 2] ?? 0;
  const todayLines = lines.filter((l) => istDateKey(l.date) === todayKey);

  const schedule = slots.map((s) => ({
    time: `${s.start} – ${s.end}`,
    what: s.state === "BOOKED" ? s.detail ?? "Booked session" : "Open availability",
    kind: s.state === "BOOKED" ? "booked" : "open",
  }));
  if (room?.isLive) schedule.push({ time: `${istTime(room.startedAt)} – live`, what: `Live room — ${room.topic}`, kind: "live" });
  schedule.sort((x, y) => x.time.localeCompare(y.time));
  const barDays = [...byDay.keys()];

  res.json({
    dashboard: {
      dateLine: `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} · all times IST`,
      todayEarnings: today,
      earningsDelta: yesterday > 0 ? `${today >= yesterday ? "+" : "−"}${Math.round(Math.abs(today - yesterday) / yesterday * 100)}% vs yesterday` : "first earnings this week",
      sessions: todayLines.filter((l) => l.kind !== "adjustment").length,
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
 */
portalRouter.post("/heartbeat", async (req, res) => {
  const a = await me(req);
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
      })),
      bookedDetail: "Booked · customer C-5512 · Fixed Session 30 min. Cancelling needs a reason.",
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
  const clash = await db.availabilitySlot.findFirst({
    where: { astrologerId: a.id, date: day, state: { not: "CANCELLED" }, start: { lt: end }, end: { gt: start } },
  });
  if (clash) throw conflict(`That range overlaps a slot you already have on ${weekdayLabel(date)}.`);
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

// ── Consultations ──

const MODE_LABEL: Record<string, string> = { CHAT: "Chat", VOICE: "Voice", VIDEO: "Video" };
const modeLabel = (c: { kind: string; mode: string }) => (c.kind === "INSTANT" ? "Instant Call" : MODE_LABEL[c.mode] ?? c.mode);

portalRouter.get("/consultations", async (req, res) => {
  const a = await me(req);
  await expireStaleRequests(a.id);
  const now = new Date();
  const [requests, active, queueMax] = await Promise.all([
    db.consultation.findMany({ where: { astrologerId: a.id, status: "REQUESTED" }, orderBy: { requestedAt: "asc" }, include: { customer: true } }),
    db.consultation.findFirst({ where: { astrologerId: a.id, status: "ACTIVE" }, orderBy: { connectedAt: "desc" }, include: { customer: true } }),
    configNumber("live.queue.max_depth", 20),
  ]);
  const first = requests[0];
  let session = null;
  if (active?.connectedAt) {
    const secs = Math.floor((now.getTime() - active.connectedAt.getTime()) / 1000);
    const wallet = active.customerId ? await db.wallet.findUnique({ where: { userId: active.customerId } }) : null;
    const remaining = active.heldAmount > 0 ? Math.floor(active.heldAmount / active.rate) - Math.ceil(secs / 60) : 99;
    session = {
      id: active.id,
      alias: active.customerAlias,
      mode: modeLabel(active),
      instant: active.kind === "INSTANT",
      elapsed: `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
      elapsedSeconds: secs,
      lowBalance: remaining <= 2,
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
        rate: r.rate,
        waiting: waitedFor(r.requestedAt, now),
        profile: r.customer ? consultSummary(r.customer) : null,
      })),
      queueMax,
      session,
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
  const [entries, announcements] = await Promise.all([
    db.liveQueueEntry.findMany({ where: { roomId: room.id, status: "WAITING" }, orderBy: { createdAt: "asc" }, include: { user: true } }),
    db.liveAnnouncement.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: MAX_ANNOUNCEMENTS_SHOWN }),
  ]);
  const now = new Date();
  const secs = Math.max(0, Math.floor((Date.now() - room.startedAt.getTime()) / 1000));
  res.json({
    room: {
      id: room.id,
      isLive: room.isLive,
      topic: room.topic,
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
  const { topic } = z
    .object({
      topic: z
        .string({ error: "Give your live a topic." })
        .trim()
        .min(3, "Give your live a topic, e.g. “Saturn transit Q&A”.")
        .max(80, "Keep the topic under 80 characters."),
    })
    .parse(req.body);
  if (!canWork(a)) throw forbidden(a.suspension !== "none" ? "Blocked — account suspended." : "Blocked — your account isn't active yet.");
  if (containsContactDetails(topic)) throw badRequest(CONTACT_BLOCKED_NOTICE);
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
      data: { isLive: true, startedAt: now, topic, viewers: 0, state: "normal", pollCounts: room.pollOptions.map(() => 0) },
    });
    if (!count) return false;
    await tx.pollVote.deleteMany({ where: { roomId: room.id } });
    await tx.liveQueueEntry.updateMany({ where: { roomId: room.id, status: "WAITING" }, data: { status: "LEFT" } });
    await tx.astrologer.updateMany({ where: { id: a.id, presence: { not: "OFF" } }, data: { presence: "LIVE", lastSeenAt: now } });
    return true;
  });
  if (started) await audit(req.auth ?? null, "live.start", room.id, `OFF → LIVE · ${topic}`);
  res.status(started ? 201 : 200).json({ ok: true, alreadyLive: !started });
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

portalRouter.get("/messages", async (req, res) => {
  const a = await me(req);
  const threads = await db.messageThread.findMany({
    where: { astrologerId: a.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  res.json({
    threads: threads.map((t) => {
      const lastCustomer = [...t.messages].reverse().find((m) => m.sender === "CUSTOMER");
      return {
        id: t.id,
        alias: t.customerAlias,
        preview: (lastCustomer ?? t.messages[t.messages.length - 1])?.text.slice(0, 40) ?? "",
        messages: t.messages.map((m) => ({ from: m.blocked ? "blocked" : m.sender === "ASTROLOGER" ? "me" : "customer", text: m.text })),
      };
    }),
  });
});

portalRouter.post("/messages/:threadId", async (req, res) => {
  const a = await me(req);
  const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
  const thread = await db.messageThread.findUnique({ where: { id: String(req.params.threadId) } });
  if (!thread || thread.astrologerId !== a.id) throw notFound("Conversation not found.");
  const blocked = containsContactDetails(text);
  // A message with contact details is never delivered; the sender sees why.
  const message = await db.message.create({
    data: blocked
      ? { threadId: thread.id, sender: "SYSTEM", text: CONTACT_BLOCKED_NOTICE, blocked: true }
      : { threadId: thread.id, sender: "ASTROLOGER", text },
  });
  await db.messageThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ blocked, message: { from: blocked ? "blocked" : "me", text: message.text } });
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
  res.json({
    earnings: {
      periodLabel: `${p.label} · your share only`,
      periods: list.map((x) => x.label),
      periodIndex: index,
      gross: lines.reduce((s, l) => s + lineAmount(a, l), 0),
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
        amount: lineAmount(a, l),
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
      videoRenewalDays: 14,
      // Only astrologers listed on the site have a public profile (same rule as the directory).
      publicProfileUrl: a.lifecycle === "active" && a.suspension !== "full" ? `/astrologer/${a.slug}` : null,
      published: { bio: a.about, skills: a.skills },
      draft: pending[0] ? { bio: pending[0].bio, skills: pending[0].skills } : null,
    },
  });
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
