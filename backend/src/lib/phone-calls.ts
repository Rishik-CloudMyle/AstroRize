import { db } from "../db.ts";
import type { Consultation, PhoneCall } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { configNumber } from "./settings.ts";
import { billedElapsed, endConsultation, lockKey, sessionCapSeconds, startBilling } from "./consultations.ts";
import { conflict } from "./errors.ts";
import { PhoneProviderError, downloadRecording, findRecordingUrl, phoneConfigured, scrub, startCall, type PhoneEvent } from "./phone/acefone.ts";
import { DIAL_SECONDS, hangupCalls, isLive, latestCall, phoneReady } from "./phone/state.ts";
import { recordAstrologerConsent } from "./recordings.ts";
import { recordingStore } from "./recording-store.ts";
import { open, seal } from "./secret-box.ts";
import { config } from "../config.ts";

// The backup for in-app voice: a normal phone call between the customer's and the astrologer's
// mobiles, used when the in-app call can't connect. Same session, same price per minute, same single
// debit. Billing starts when the customer answers (Acefone's "answered" webhook); any minutes
// already spent in the app are carried over, so nothing is billed twice or lost. Calls are recorded
// by the provider and copied into AstroRize's private recording store.

const MAX_ATTEMPTS = 3;
const maskNumber = (phone: string) => `••••••${phone.replace(/\D/g, "").slice(-4)}`;

async function numbersOf(c: Consultation) {
  const [customer, astrologer] = await Promise.all([
    c.customerId ? db.user.findUnique({ where: { id: c.customerId }, select: { phone: true } }) : null,
    db.astrologer.findUnique({ where: { id: c.astrologerId }, select: { user: { select: { phone: true } } } }),
  ]);
  return { customer: customer?.phone ?? null, astrologer: astrologer?.user?.phone ?? null };
}

/** Why a phone call can't be offered for this session (null: it can). */
async function blocker(c: Consultation, numbers: Awaited<ReturnType<typeof numbersOf>>) {
  if (c.mode !== "VOICE" || c.kind === "INSTANT") return "Phone calls are a backup for voice calls only.";
  if (c.status !== "ACTIVE") return "This consultation isn't in progress.";
  if (!c.customerRecordingConsentAt) return "Phone calls are recorded, and this session wasn't started with the recording notice.";
  if (!numbers.customer) return "Add your mobile number to your account to use a phone call.";
  if (!numbers.astrologer) return "This astrologer can't be reached by phone.";
  if ((await db.phoneCall.count({ where: { consultationId: c.id } })) >= MAX_ATTEMPTS) return "The phone call was tried three times. End the session and start again.";
  return null;
}

/** What one side's screen shows. The other person's number is never part of it. */
export async function phoneState(c: Consultation, party: "CUSTOMER" | "ASTROLOGER") {
  if (!(await phoneReady()) || c.mode !== "VOICE" || c.kind === "INSTANT") return { enabled: false as const };
  const [numbers, last] = await Promise.all([numbersOf(c), latestCall(db, c.id)]);
  const reason = await blocker(c, numbers);
  const live = !!last && isLive(last.status);
  return {
    enabled: true as const,
    /** The customer may start (or retry) a phone call now. */
    canStart: party === "CUSTOMER" && !reason && !live,
    reason: party === "CUSTOMER" && !live ? reason : null,
    /** Your own number, masked: the phone that will ring. */
    yourNumber: (party === "CUSTOMER" ? numbers.customer : numbers.astrologer) ? maskNumber((party === "CUSTOMER" ? numbers.customer : numbers.astrologer)!) : null,
    /** AstroRize's number, shown on the incoming call. */
    from: `+${config.acefoneCallerId.replace(/\D/g, "")}`,
    call: last ? { status: last.status as "DIALING" | "ANSWERED" | "ENDED" | "FAILED", reason: last.status === "FAILED" ? last.failureReason : null } : null,
  };
}

export async function startPhoneCall(c: Consultation) {
  if (!(await phoneReady())) throw conflict("Phone calls aren't available right now.");
  const numbers = await numbersOf(c);
  const reason = await blocker(c, numbers);
  if (reason) throw conflict(reason);
  const standardFree = await configNumber("consult.free_seconds", 60);

  const prepared = await db.$transaction(async (tx) => {
    await lockKey(tx, `consult:${c.customerId}`);
    const fresh = await tx.consultation.findUniqueOrThrow({ where: { id: c.id } });
    if (fresh.status !== "ACTIVE") throw conflict("This consultation isn't in progress.");
    const last = await latestCall(tx, c.id);
    if (last && isLive(last.status)) throw conflict("A phone call is already being connected.");
    // Time already billed in the app is carried into the phone call.
    const carried = fresh.billingStartedAt ? billedElapsed(fresh) : (last?.billedBeforeSeconds ?? 0);
    const remaining = sessionCapSeconds(fresh, standardFree) - carried;
    if (remaining < 15) throw conflict("There isn't enough time left on this session for a phone call.");
    const call = await tx.phoneCall.create({ data: { consultationId: c.id, billedBeforeSeconds: carried } });
    // The clock waits until the customer answers.
    await tx.consultation.update({ where: { id: c.id }, data: { billingStartedAt: null, customerJoinedAt: null, astrologerJoinedAt: null } });
    return { call, remaining, before: fresh };
  });

  try {
    // The astrologer accepted the request after seeing the recording notice.
    await recordAstrologerConsent(c);
    const { ref } = await startCall({ astrologerPhone: numbers.astrologer!, customerPhone: numbers.customer!, sessionRef: c.ref, maxSeconds: prepared.remaining + 30 });
    await db.phoneCall.update({ where: { id: prepared.call.id }, data: { providerRef: ref } });
    await audit(null, "phone.call.start", c.ref, `Phone backup started (attempt on ${prepared.call.id})`);
  } catch (e) {
    const why = scrub(e instanceof Error ? e.message : String(e));
    console.error(`Phone call for ${c.ref}:`, why);
    // Nothing is ringing: the session goes back to how it was.
    await db.$transaction([
      db.phoneCall.update({ where: { id: prepared.call.id }, data: { status: "FAILED", endedAt: new Date(), failureReason: "The call couldn't be placed." } }),
      db.consultation.updateMany({
        where: { id: c.id, status: "ACTIVE" },
        data: { billingStartedAt: prepared.before.billingStartedAt, customerJoinedAt: prepared.before.customerJoinedAt, astrologerJoinedAt: prepared.before.astrologerJoinedAt },
      }),
    ]);
    await audit(null, "phone.call.failed", c.ref, why);
    throw conflict(e instanceof PhoneProviderError ? "The phone call couldn't be placed. Try again, or keep using the app." : "Something went wrong placing the call.");
  }
}

// ── Webhooks ──

const findCall = (e: PhoneEvent) => {
  const or = [...(e.ref ? [{ providerRef: e.ref }] : []), ...(e.callId ? [{ providerCallId: e.callId }] : [])];
  return or.length ? db.phoneCall.findFirst({ where: { OR: or } }) : null;
};

/** The customer answered: both are on the line, so billing starts. Safe to receive twice. */
export async function onAnswered(e: PhoneEvent) {
  const p = await findCall(e);
  if (!p) return;
  const c = await db.consultation.findUniqueOrThrow({ where: { id: p.consultationId } });
  const started = await db.$transaction(async (tx) => {
    if (c.customerId) await lockKey(tx, `consult:${c.customerId}`);
    const call = await tx.phoneCall.findUniqueOrThrow({ where: { id: p.id } });
    const fresh = await tx.consultation.findUniqueOrThrow({ where: { id: c.id } });
    if (call.status !== "DIALING" || fresh.status !== "ACTIVE") return false;
    const now = new Date();
    await tx.phoneCall.update({ where: { id: call.id }, data: { status: "ANSWERED", answeredAt: now, providerCallId: e.callId ?? call.providerCallId } });
    await startBilling(tx, fresh, now, call.billedBeforeSeconds);
    return true;
  });
  // The session closed while the phones were ringing: hang up.
  if (!started && (await db.consultation.findUniqueOrThrow({ where: { id: c.id } })).status !== "ACTIVE") await hangupCalls(c.id);
}

/** The call is over (answered or not): the session is settled and the recording queued. Safe to receive twice. */
export async function onHangup(e: PhoneEvent) {
  const p = await findCall(e);
  if (!p) return;
  const answered = !!p.answeredAt;
  const first = isLive(p.status);
  await db.phoneCall.update({
    where: { id: p.id },
    data: {
      ...(first ? { status: answered ? "ENDED" : "FAILED", endedAt: new Date(), talkSeconds: e.talkSeconds, failureReason: answered ? null : "The call wasn't answered." } : {}),
      providerCallId: e.callId ?? p.providerCallId,
      ...(answered && p.recordingState === "NONE" ? { recordingState: "PENDING" } : {}),
      ...(answered && e.recordingUrl && p.recordingState !== "SAVED" ? { recordingUrlEnc: seal(e.recordingUrl) } : {}),
    },
  });
  if (!first || !answered) return;
  const c = await db.consultation.findUniqueOrThrow({ where: { id: p.consultationId } });
  if (c.status !== "ACTIVE") return;
  // Never past what the provider says was talked, nor past now.
  const at = e.talkSeconds > 0 ? new Date(Math.min(Date.now(), p.answeredAt!.getTime() + e.talkSeconds * 1000)) : new Date();
  await endConsultation(c, "user", at);
}

// ── Recordings and the sweep ──

async function saveRecording(p: PhoneCall) {
  const url = p.recordingUrlEnc ? open(p.recordingUrlEnc) : p.providerCallId ? await findRecordingUrl(p.providerCallId) : null;
  if (!url) throw new PhoneProviderError("The recording isn't ready yet.");
  const { data, mime } = await downloadRecording(url);
  const take = (await db.callRecording.count({ where: { consultationId: p.consultationId, side: "SERVER" } })) + 1;
  const row = await db.callRecording.create({ data: { consultationId: p.consultationId, side: "SERVER", take, status: "FAILED", mimeType: mime, startedAt: p.answeredAt ?? p.createdAt } });
  await recordingStore.putChunk(row.id, 0, data);
  const { key, bytes } = await recordingStore.assemble(row.id, 1, mime === "audio/wav" ? "wav" : "mp3");
  await db.callRecording.update({ where: { id: row.id }, data: { status: "READY", storageKey: key, bytes, chunks: 1, durationMs: p.talkSeconds * 1000, endedAt: p.endedAt ?? new Date(), note: "Phone call" } });
  // The provider's address is no longer needed.
  await db.phoneCall.update({ where: { id: p.id }, data: { recordingState: "SAVED", recordingUrlEnc: null } });
}

export async function sweepPhoneCalls(now = new Date()) {
  if (!phoneConfigured()) return;
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  // Nobody answered in time.
  for (const p of await db.phoneCall.findMany({ where: { status: "DIALING", createdAt: { lt: ago(DIAL_SECONDS) } }, take: 20 })) {
    await hangupCalls(p.consultationId);
    await db.phoneCall.updateMany({ where: { id: p.id, status: "DIALING" }, data: { status: "FAILED", endedAt: now, failureReason: "The call wasn't answered." } });
  }
  // Answered calls: stop at the session's limit (wallet or time), and tidy up lost hang-ups.
  const standardFree = await configNumber("consult.free_seconds", 60);
  for (const p of await db.phoneCall.findMany({ where: { status: "ANSWERED" }, include: { consultation: true }, take: 50 })) {
    const c = p.consultation;
    if (c.status !== "ACTIVE") {
      await hangupCalls(c.id);
      if (c.endedAt && c.endedAt < ago(300)) await db.phoneCall.update({ where: { id: p.id }, data: { status: "ENDED", endedAt: c.endedAt, recordingState: "PENDING" } });
    } else if (billedElapsed(c, now.getTime()) >= sessionCapSeconds(c, standardFree)) {
      await endConsultation(c, "user");
    }
  }
  // Copy recordings in: they can take a few minutes to be ready, so keep trying for about a day.
  const due = await db.phoneCall.findMany({ where: { recordingState: "PENDING", OR: [{ lastTryAt: null }, { lastTryAt: { lt: ago(60) } }] }, take: 5 });
  for (const p of due) {
    // Wait longer between later tries.
    if (p.lastTryAt && p.recordingTries >= 10 && p.lastTryAt > ago(3600)) continue;
    const claimed = await db.phoneCall.updateMany({ where: { id: p.id, recordingTries: p.recordingTries }, data: { recordingTries: p.recordingTries + 1, lastTryAt: now } });
    if (!claimed.count) continue;
    try {
      await saveRecording(p);
    } catch (e) {
      const why = scrub(e instanceof Error ? e.message : String(e));
      if (p.recordingTries + 1 >= 34) {
        await db.phoneCall.update({ where: { id: p.id }, data: { recordingState: "FAILED", failureReason: why } });
        await audit(null, "phone.recording.failed", p.consultationId, why);
      }
    }
  }
}

export function startPhoneSweep() {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    void sweepPhoneCalls()
      .catch((e) => console.error("Phone sweep failed:", scrub(e instanceof Error ? e.message : String(e))))
      .finally(() => (running = false));
  }, 5_000).unref();
}
