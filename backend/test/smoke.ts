// End-to-end check of the API against freshly seeded demo data.
//   1. npm run db:seed      (the checks expect the demo data as seeded)
//   2. npm run dev          (the API must be running)
//   3. npm test
// The application-flow checks alone (any database state): node --env-file=.env test/application-flow.ts
// Set API_URL to test through the website's proxy, e.g. API_URL=http://localhost:3000/api

import { db } from "../src/db.ts";
import { sweepStalePresence } from "../src/lib/presence.ts";
import { applicationFlow } from "./application-flow.ts";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(extra)}`);
};

function client() {
  let cookie = "";
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.getSetCookie();
    for (const c of set) {
      const [kv] = c.split(";");
      const [k] = kv!.split("=");
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(k + "=")), kv].join("; ");
    }
    const text = await r.text();
    let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  };
}
const login = async (email: string) => { const c = client(); const r = await c("POST", "/auth/login", { email, password: "123456" }); check(`login ${email}`, r.status === 200, r); return c; };

// Public
const anon = client();
let r = await anon("GET", "/astrologers");
check("public directory lists 6", r.status === 200 && r.body.astrologers?.length === 6, r.body);
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("profile price ₹28, instant ₹84", r.body.astrologer?.price === 28 && r.body.astrologer?.instant === 84, r.body.astrologer);
r = await anon("GET", "/live-rooms");
check("nobody is live after a fresh seed", r.status === 200 && r.body.rooms?.length === 0, r.body);
r = await anon("GET", "/astrologers");
check("everyone starts offline", (r.body.astrologers ?? []).every((a: any) => a.availability === "off"), (r.body.astrologers ?? []).map((a: any) => a.availability));
r = await anon("GET", "/stats/now");
check("live-now stats are all zero", r.status === 200 && r.body.now?.online === 0 && r.body.now?.liveRooms === 0 && r.body.now?.consultationsToday === 0, r.body);
r = await anon("GET", "/wallet");
check("wallet needs sign-in (401)", r.status === 401, r);
r = await fetch(API + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }).then((x) => ({ status: x.status, body: null }));
check("malformed JSON is a 400, not a 500", r.status === 400, r);
r = await anon("POST", "/auth/login", { email: "nobody@x.com", password: "x" });
check("unknown email message", r.status === 401 && /No account/.test(r.body.error?.message), r);

// OTP sign-in (new customer)
const otp = client();
r = await otp("POST", "/auth/otp/request", { phone: "9123456780" });
check("otp request returns devCode", r.status === 200 && /^\d{6}$/.test(r.body.devCode), r);
const bad = await otp("POST", "/auth/otp/verify", { phone: "9123456780", code: r.body.devCode === "000000" ? "111111" : "000000" });
check("wrong otp rejected", bad.status === 400, bad);
r = await otp("POST", "/auth/otp/verify", { phone: "9123456780", code: r.body.devCode });
check("otp verify signs in customer", r.status === 200 && r.body.user?.role === "customer", r);
r = await otp("GET", "/wallet");
check("new wallet empty", r.status === 200, r.body);
r = await otp("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT" });
check("empty wallet can't consult", r.status >= 400, r);

// Astrologers come online from their portal (each has a login)
const astro = await login("raghav.joshi@email.com");
const arjun = await login("arjun.deshmukh@email.com");
r = await arjun("PATCH", "/portal/presence", { online: true });
check("arjun goes online", r.status === 200 && r.body.presence === "on", r);
r = await anon("GET", "/astrologers/pandit-arjun-deshmukh");
check("public profile shows arjun available", r.body.astrologer?.availability === "on", r.body.astrologer?.availability);
r = await astro("PATCH", "/portal/presence", { online: true });
check("raghav goes online", r.status === 200 && r.body.online === true, r);
r = await astro("POST", "/portal/heartbeat");
check("heartbeat keeps raghav online", r.status === 200 && r.body.presence === "on", r);

// Demo customer: recharge + consult billing
const cust = await login("customer@astrorize.com");
r = await cust("GET", "/wallet");
check("demo wallet matches its ledger (2389 + 40)", r.body.wallet?.service === 2389 && r.body.wallet?.promo === 40, r.body.wallet);
r = await cust("POST", "/wallet/recharge", { amount: 500 });
check("recharge order", r.status === 201 && r.body.total === 590, r);
const orderId = r.body.orderId;
r = await cust("POST", `/wallet/recharge/${orderId}/confirm`);
check("recharge confirm", r.status === 200, r);
r = await cust("POST", `/wallet/recharge/${orderId}/confirm`);
check("confirm idempotent", r.status === 200, r);
r = await cust("GET", "/wallet");
check("wallet credited 500 + 40 bonus once", r.body.wallet?.service === 2889 && r.body.wallet?.promo === 80, r.body.wallet);
r = await cust("POST", "/consultations", { astrologerId: "meera", mode: "VOICE" });
check("offline astrologer can't be consulted (409)", r.status === 409 && /offline/.test(r.body.error?.message), r);
r = await cust("POST", "/instant-calls", { astrologerId: "meera" });
check("no Instant Call to an offline astrologer (409)", r.status === 409 && /offline/.test(r.body.error?.message), r);
r = await cust("POST", "/consultations", { astrologerId: "arjun", mode: "VOICE" });
check("consult created", r.status === 200 || r.status === 201, r);
const cid = r.body.consultation?.id ?? r.body.id;
r = await cust("POST", `/consultations/${cid}/connect`);
check("consult connect", r.status === 200 && r.body.freeSeconds === 60, r);
r = await anon("GET", "/astrologers/pandit-arjun-deshmukh");
check("arjun shows busy while in session", r.body.astrologer?.availability === "busy", r.body.astrologer?.availability);
r = await otp("POST", "/consultations", { astrologerId: "arjun", mode: "CHAT" });
check("busy astrologer refused (409)", r.status === 409 && /another consultation/.test(r.body.error?.message), r);

// Inside the session: its chat (the two parties only, contact details blocked) and its media room
r = await cust("POST", `/consultations/${cid}/messages`, { text: "Namaste, I have a question about my career." });
check("consult chat: customer sends", r.status === 201 && r.body.blocked === false && r.body.message?.from === "me", r);
r = await cust("POST", `/consultations/${cid}/messages`, { text: "Call me on 98765 43210" });
check("consult chat: contact details blocked (sender told)", r.status === 201 && r.body.blocked === true && r.body.message?.from === "blocked" && !/98765/.test(r.body.message?.text), r);
r = await arjun("GET", `/portal/consultations/${cid}/messages`);
check(
  "consult chat: astrologer sees the message, never the blocked one",
  r.status === 200 && r.body.open === true && r.body.messages?.length === 1 && r.body.messages[0].from === "customer",
  r.body,
);
r = await arjun("POST", `/portal/consultations/${cid}/messages`, { text: "Namaste. Tell me your question." });
check("consult chat: astrologer replies", r.status === 201 && r.body.message?.from === "me", r);
r = await cust("GET", `/consultations/${cid}/messages`);
check("consult chat: customer sees 3 lines incl. own blocked notice", r.status === 200 && r.body.messages?.map((m: any) => m.from).join() === "me,blocked,astrologer", r.body);
r = await otp("GET", `/consultations/${cid}/messages`);
check("consult chat: another customer gets 403", r.status === 403, r);
r = await otp("POST", `/consultations/${cid}/messages`, { text: "hi" });
check("consult chat: another customer can't send (403)", r.status === 403, r);
r = await astro("GET", `/portal/consultations/${cid}/messages`);
check("consult chat: another astrologer gets 403", r.status === 403, r);
r = await cust("GET", `/consultations/${cid}/media`);
check(
  "media: voice session, ZEGO not configured → available:false, audio only",
  r.status === 200 && r.body.media?.available === false && r.body.media?.reason === "not_configured" && r.body.media?.wants?.audio === true && r.body.media?.wants?.video === false && !r.body.media?.token,
  r.body,
);
r = await arjun("GET", `/portal/consultations/${cid}/media`);
check("media: astrologer side answers the same", r.status === 200 && r.body.media?.available === false, r.body);
r = await otp("GET", `/consultations/${cid}/media`);
check("media: another customer gets 403", r.status === 403, r);
r = await astro("GET", `/portal/consultations/${cid}/media`);
check("media: another astrologer gets 403", r.status === 403, r);
// Pretend 3 min 30 s passed: 60 s free, 150 s billed → 3 minutes × ₹22 = ₹66 (promo first)
await db.consultation.update({ where: { id: cid }, data: { connectedAt: new Date(Date.now() - 210000) } });
r = await cust("POST", `/consultations/${cid}/end`);
check("settlement ₹66, 3 min", r.body.settlement && JSON.stringify(r.body.settlement).includes("66"), r.body);
r = await cust("GET", "/wallet");
check("promo used first (80−66=14)", r.body.wallet?.promo === 14 && r.body.wallet?.service === 2889, r.body.wallet);
r = await cust("POST", `/consultations/${cid}/messages`, { text: "One more thing" });
check("consult chat: no sending after the session ended (409)", r.status === 409, r);
r = await cust("GET", `/consultations/${cid}/messages`);
check("consult chat: still readable after it ended", r.status === 200 && r.body.open === false && r.body.messages?.length === 3, r.body);
r = await cust("GET", `/consultations/${cid}/media`);
check("media: nothing minted for an ended session", r.status === 200 && r.body.media?.available === false && r.body.media?.reason === "ended", r.body);
r = await anon("GET", "/astrologers/pandit-arjun-deshmukh");
check("arjun available again after the session", r.body.astrologer?.availability === "on", r.body.astrologer?.availability);
r = await cust("POST", `/consultations/${cid}/rating`, { stars: 5, review: "Helpful and specific." });
check("rating saved", r.status === 200, r);
r = await cust("POST", "/instant-calls", { astrologerId: "raghav" });
check("instant call at ₹84", r.status < 300 && JSON.stringify(r.body).includes("84"), r);
const instantId: string = r.body.id ?? r.body.consultation?.id;
r = await cust("POST", "/consultations", { astrologerId: "arjun", mode: "CHAT" });
check("second consultation refused while one is open", r.status === 409, r);
r = await cust("POST", "/instant-calls", { astrologerId: "arjun" });
check("second instant call refused", r.status === 409, r);
r = await cust("GET", "/consultations/active");
check("open consultation is reported", r.body.consultation?.id === instantId || r.body.id === instantId || JSON.stringify(r.body).includes(instantId), r.body);
r = await cust("GET", "/admin/overview");
check("customer blocked from admin", r.status === 403 || r.status === 401, r);
r = await cust("GET", "/portal/account");
check("customer blocked from portal", r.status === 403 || r.status === 401, r);

// Astrologer portal
for (const p of ["/account", "/dashboard", "/availability", "/consultations", "/live", "/messages", "/earnings", "/profile", "/compliance", "/application"]) {
  r = await astro("GET", "/portal" + p);
  check(`portal GET ${p}`, r.status === 200, r);
}
r = await astro("GET", "/portal/consultations");
const cons = r.body.consultations;
check("incoming is the customer's Instant Call, no session yet", cons?.incoming?.id === instantId && !cons?.session, cons);
r = await astro("POST", "/portal/live/start", { topic: "Smoke test live" });
check("can't go live with a request waiting (409)", r.status === 409, r);
// A session already in progress (test fixture) blocks accepting another.
const inSession = await db.consultation.create({
  data: { ref: `SES-T${Date.now()}`, astrologerId: "raghav", customerAlias: "T-0001", mode: "CHAT", rate: 28, status: "ACTIVE", requestedAt: new Date(), connectedAt: new Date() },
});
r = await astro("POST", `/portal/consultations/${instantId}/accept`);
check("one active consult at a time (409)", r.status === 409, r);
r = await astro("POST", `/portal/consultations/${inSession.id}/end`);
check("end active session", r.status === 200, r);
r = await astro("GET", "/portal/messages");
const thread = r.body.threads?.[0]?.id ?? r.body.messages?.threads?.[0]?.id;
r = await astro("POST", `/portal/messages/${thread}`, { text: "Call me on 9876543210" });
check("contact details blocked", JSON.stringify(r.body).toLowerCase().includes("contact details"), r);

// Messages: real customers, profiles only for the astrologer's own conversations
r = await astro("GET", "/portal/messages");
const sneha = (r.body.threads ?? []).find((t: any) => t.customer?.name === "Sneha R");
check("portal messages show the customer's real name and photo", !!sneha?.customer?.photoUrl && /Pune/.test(sneha.customer.line), r.body.threads?.map((t: any) => t.customer));
r = await astro("GET", `/portal/messages/${sneha?.id}/customer`);
check("astrologer opens a messaging customer's profile", r.status === 200 && !!r.body.person?.profile?.birthPlace && typeof r.body.person?.history?.consultations === "number", r);
r = await arjun("GET", `/portal/messages/${sneha?.id}/customer`);
check("another astrologer can't open that profile (404)", r.status === 404, r);
r = await cust("GET", "/messages");
check("customer lists their conversations", r.status === 200 && r.body.conversations?.some((c: any) => c.astrologer.id === "raghav"), r.body);
r = await cust("POST", "/messages/acharya-meera-iyer", { text: "Hello" });
check("any listed astrologer can be messaged, no consultation needed", r.status === 201 && r.body.blocked === false, r);
r = await cust("GET", "/messages/search/astrologers?q=arj");
check("customer finds astrologers by name", r.status === 200 && r.body.astrologers?.[0]?.slug === "pandit-arjun-deshmukh" && typeof r.body.astrologers[0].presence === "string", r.body);
r = await cust("GET", "/messages/rohit-not-listed-xyz");
check("unknown astrologer address is a 404", r.status === 404, r);
r = await cust("POST", "/messages/pandit-arjun-deshmukh", { text: "Thank you for the reading." });
check("customer starts a conversation with an astrologer", r.status === 201 && r.body.blocked === false && !!r.body.conversationId, r);
r = await cust("POST", "/messages/pandit-arjun-deshmukh", { text: "My number is 98765 43210" });
check("customer's contact details blocked", r.status === 201 && r.body.blocked === true, r);
r = await cust("POST", "/messages/pandit-arjun-deshmukh", { text: "   " });
check("empty message rejected", r.status === 400, r);
r = await arjun("GET", "/portal/messages");
const fromSneha = (r.body.threads ?? []).find((t: any) => t.customer?.name === "Sneha R");
check("astrologer receives it; the blocked attempt stays with the sender", fromSneha?.messages?.length === 1 && fromSneha.messages[0].from === "customer", fromSneha);
r = await arjun("POST", `/portal/messages/${fromSneha?.id}`, { text: "Glad it helped." });
check("astrologer replies", r.status === 201 && r.body.blocked === false, r);
r = await cust("GET", "/messages/pandit-arjun-deshmukh");
check("customer sees the reply", r.body.conversation?.messages?.at(-1)?.from === "astrologer" && r.body.canMessage === true, r.body);
r = await astro("PATCH", "/portal/multiplier", { multiplier: 10 });
check("multiplier above max rejected", r.status === 400, r);

// Instant Call: the astrologer sees who is calling, accepts, and the customer is in session
r = await astro("GET", `/portal/consultations/${instantId}/profile`);
check("astrologer sees the caller's details", r.status === 200 && JSON.stringify(r.body).includes("Sneha"), r.body);
r = await cust("GET", `/portal/consultations/${instantId}/profile`);
check("customer can't open request details", r.status === 403, r);
r = await astro("GET", "/portal/consultations");
const activeNow = r.body.consultations?.session?.id;
if (activeNow) await astro("POST", `/portal/consultations/${activeNow}/end`);
r = await astro("POST", `/portal/consultations/${instantId}/accept`);
check("astrologer accepts the instant call", r.status === 200, r);
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("raghav shows busy during the call", r.body.astrologer?.availability === "busy", r.body.astrologer?.availability);
r = await cust("GET", "/consultations/active");
check("customer is now in session", JSON.stringify(r.body).includes("ACTIVE") || JSON.stringify(r.body).toLowerCase().includes('"status":"active"'), r.body);
r = await cust("POST", `/consultations/${instantId}/end`);
check("customer ends the session", r.status === 200 && !!r.body.settlement, r);
r = await cust("GET", "/consultations/active");
check("nothing open after ending", r.status === 200 && !r.body.consultation, r.body);
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("raghav available again after the call", r.body.astrologer?.availability === "on", r.body.astrologer?.availability);
r = await anon("GET", "/stats/now");
check("stats count real activity (2 online, 3 consultations today)", r.body.now?.online === 2 && r.body.now?.consultationsToday === 3, r.body.now);

// Admin separation of duties
const superA = await login("admin@astrorize.com");
const fin = await login("finance@astrorize.com");
const sup = await login("support@astrorize.com");
const comp = await login("compliance@astrorize.com");
for (const p of ["/session", "/overview", "/config", "/finance", "/support", "/lifecycle", "/marketing", "/monitoring", "/trust", "/rbac", "/audit", "/recording", "/search?q=raghav"]) {
  r = await superA("GET", "/admin" + p);
  check(`admin GET ${p}`, r.status === 200, r);
}
const change = await db.configChange.findFirstOrThrow({ where: { status: "SUBMITTED" } });
r = await superA("POST", `/admin/config/changes/${change.id}/approve`);
check("drafter can't approve own config change", r.status === 403, r);
r = await fin("POST", `/admin/config/changes/${change.id}/approve`);
check("finance approves config change", r.status === 200, r);
r = await superA("POST", "/admin/config/consult.free_seconds/draft", { value: "500" });
check("out-of-bounds draft rejected", r.status === 400, r);
// Seeded batches follow the calendar (half-month cycles), so find them by state.
const draftBatch = await db.payoutBatch.findFirstOrThrow({ where: { state: "DRAFT" } });
const approvedBatch = await db.payoutBatch.findFirstOrThrow({ where: { state: "APPROVED" } });
check("seeded approved batch was approved by Finance", approvedBatch.approvedByName === "A. Verma", approvedBatch);
r = await fin("POST", `/admin/payouts/${approvedBatch.id}/release`);
check("finance can't release", r.status === 403, r);
r = await superA("POST", `/admin/payouts/${approvedBatch.id}/release`);
check("super releases batch approved by finance", r.status === 200, r);
r = await superA("POST", `/admin/payouts/${draftBatch.id}/approve`);
check("super approves draft batch", r.status === 200, r);
r = await superA("POST", `/admin/payouts/${draftBatch.id}/release`);
check("approver can't release payout", r.status === 403, r);
r = await sup("POST", "/admin/support/TKT-3384/refund/approve");
check("support can't approve refund", r.status === 403, r);
r = await fin("GET", "/admin/finance");
check("finance sees the proposed refund", r.body.finance?.disputeRefunds?.some((x: { id: string }) => x.id === "TKT-3384"), r.body.finance?.disputeRefunds);
r = await fin("POST", "/admin/support/TKT-3384/refund/approve");
check("finance approves a refund support proposed (from Finance)", r.status === 200, r);
r = await cust("GET", "/wallet");
check("approved refund is back in the customer's wallet", r.body.wallet?.transactions?.[0]?.type === "Refund" && r.body.wallet?.transactions?.[0]?.amount === 960, r.body.wallet?.transactions?.[0]);
r = await fin("POST", "/admin/support/TKT-3384/refund/approve");
check("a refund can't be approved twice", r.status === 409, r);
r = await sup("POST", "/admin/support/TKT-3391/refund/propose");
check("no second refund for the same session", r.status === 409 && /already has a refund/.test(r.body.error?.message), r);
r = await sup("GET", "/admin/finance");
check("support can't open finance page", r.status === 403, r);
r = await comp("GET", "/admin/monitoring");
check("monitoring is empty while nobody is live", r.status === 200 && r.body.monitoring?.lives?.length === 0 && r.body.monitoring?.capacity?.used === 0, r.body.monitoring);
const anyConsult = await db.consultation.findFirstOrThrow({ select: { ref: true } });
r = await comp("POST", `/admin/monitoring/${anyConsult.ref}/join`, {});
check("private consult can't be observed", r.status === 403, r);
r = await comp("POST", "/admin/monitoring/raghav/join", {});
check("can't observe a room that isn't live", r.status === 404, r);
// Recording & retention: honest, and only a Super Admin changes retention
r = await comp("GET", "/admin/recording");
check("recording page: no provider, chat retention 3 years", r.status === 200 && r.body.recording?.provider?.connected === false && r.body.recording?.retention?.days === 1095, r.body);
r = await comp("PUT", "/admin/recording/retention", { days: 365 });
check("compliance can't change retention", r.status === 403, r);
r = await superA("PUT", "/admin/recording/retention", { days: 10 });
check("retention below 30 days refused", r.status === 400, r);
r = await superA("PUT", "/admin/recording/retention", { days: 1825 });
check("super sets retention to 5 years", r.status === 200, r);
r = await superA("PUT", "/admin/recording/retention", { days: 1095 });
check("and back to 3 years (audited)", r.status === 200 && !!(await db.auditLog.findFirst({ where: { action: "retention.update", diff: "1825 days → 1095 days" } })), r);
r = await superA("GET", "/admin/audit/export");
check("audit CSV export", r.status === 200 && typeof r.body === "string" && r.body.includes("payout.batch.release"), String(r.body).slice(0, 200));

// ── Client requests, Oct 2026: profiles, live announcements, departments ──

// Customer profile
r = await cust("GET", "/me/profile");
check("customer profile loads", r.status === 200 && r.body.profile?.firstName === "Sneha" && r.body.profile?.birthTime === "06:42", r.body);
const profile = r.body.profile;
r = await cust("PUT", "/me/profile", { ...profile, birthDate: "2999-01-01" });
check("future date of birth rejected", r.status === 400, r);
r = await cust("PUT", "/me/profile", { ...profile, city: "Pune" });
check("profile saves", r.status === 200 && r.body.profile?.city === "Pune", r);
r = await fetch(API + "/me/photo", { method: "POST", headers: { "content-type": "image/jpeg", cookie: "" }, body: "not an image" }).then((x) => ({ status: x.status, body: null }));
check("photo upload needs sign-in", r.status === 401, r);
r = await fetch(API + "/media/..%2F.env").then((x) => ({ status: x.status, body: null }));
check("media can't reach server files", r.status === 404, r);

// Going live: a real room only while the astrologer hosts it
r = await cust("POST", "/live-rooms/raghav/queue", {});
check("can't queue for a room that isn't live", r.status === 404, r);
r = await astro("POST", "/portal/live/start", {});
check("going live needs a topic", r.status === 400, r);
r = await astro("POST", "/portal/live/start", { topic: "Smoke test live" });
check("raghav goes live", r.status === 201, r);
r = await astro("POST", "/portal/live/start", { topic: "Smoke test live" });
check("going live twice changes nothing", r.status === 200 && r.body.alreadyLive === true, r);
r = await anon("GET", "/live-rooms");
check("the room is listed while live", r.body.rooms?.length === 1 && r.body.rooms[0].id === "raghav" && r.body.rooms[0].topic === "Smoke test live", r.body);
r = await anon("GET", "/live-rooms/raghav");
check("the preview isn't counted as watching", r.status === 200 && r.body.room?.viewers === 0, r.body.room?.viewers);
r = await cust("POST", "/live-rooms/raghav/join");
check("joining counts as a real viewer", r.status === 200 && r.body.room?.viewers === 1, r.body.room?.viewers);

// Live monitoring sees the real room; the observer is watch-only and invisible to viewers
r = await comp("GET", "/admin/monitoring");
check("monitoring lists raghav's live", r.body.monitoring?.lives?.some((l: any) => l.id === "raghav" && l.topic === "Smoke test live"), r.body.monitoring?.lives);
r = await comp("POST", "/admin/monitoring/raghav/join", {});
const leaseId = r.body.lease?.id;
check("compliance joins as observer", r.status === 200 && !!leaseId, r);
r = await comp("GET", "/admin/monitoring");
check("one observer seat in use", r.body.monitoring?.capacity?.used === 1 && r.body.monitoring?.myLease?.id === leaseId, r.body.monitoring?.capacity);
await cust("POST", "/live-rooms/raghav/chat", { text: "Hello from smoke" });
r = await comp("GET", `/admin/monitoring/leases/${leaseId}`);
check("observer sees the room and its chat", r.body.status === "observing" && r.body.room?.chat?.some((c: any) => c.text === "Hello from smoke"), r.body);
r = await anon("GET", "/live-rooms/raghav");
check("observer isn't counted as a viewer", r.body.room?.viewers === 1, r.body.room?.viewers);
r = await comp("POST", "/admin/monitoring/raghav/flag", { reason: "Other policy concern", note: "smoke" });
check("observer flags the live", r.status === 200, r);
r = await comp("GET", "/admin/monitoring");
check("the flag shows as a review signal", r.body.monitoring?.lives?.find((l: any) => l.id === "raghav")?.priority === "review", r.body.monitoring?.lives);
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("raghav shows live", r.body.astrologer?.availability === "live", r.body.astrologer?.availability);
r = await cust("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT" });
check("direct consult refused while live (409)", r.status === 409 && /live room/.test(r.body.error?.message), r);
r = await anon("GET", "/stats/now");
check("stats list the live room and the event", r.body.now?.liveRooms === 1 && /went live · Smoke test live/.test(JSON.stringify(r.body.now?.events)), r.body.now);
r = await cust("POST", "/live-rooms/raghav/queue", {});
check("customer joins the live queue", r.status === 200 && r.body.room?.queue?.inQueue === true, r);
await astro("POST", "/portal/live/announcements", { text: "Questions about career first." });
await astro("POST", "/portal/live/announcements", { text: "Private consults open after this segment." });

// Astrologer sees who is in their live queue; nobody else does
r = await astro("GET", "/portal/live");
const queue = r.body.room?.queue ?? [];
const withProfile = queue.find((q: any) => q.profile);
check("portal live lists queue with profiles", r.status === 200 && r.body.room?.isLive === true && queue.length >= 1 && !!withProfile, r.body.room?.queue);
check("portal live lists announcements", (r.body.room?.announcements ?? []).length >= 2, r.body.room?.announcements);
r = await astro("GET", `/portal/live/queue/${withProfile?.id}/profile`);
check("astrologer opens See more", r.status === 200 && !!r.body.person?.profile?.birthPlace, r.body);
r = await cust("GET", `/portal/live/queue/${withProfile?.id}/profile`);
check("customer can't open a queue profile", r.status === 403, r);
r = await anon("GET", "/live-rooms/raghav");
check("public room has no customer profiles", !JSON.stringify(r.body).includes("birth"), "");

// Announcements
r = await astro("POST", "/portal/live/announcements", { text: "Smoke test announcement" });
const annId = r.body.announcement?.id;
check("astrologer posts announcement", r.status === 201 && !!annId, r);
r = await anon("GET", "/live-rooms/raghav");
check("viewers see the announcement", r.body.room?.announcements?.[0]?.text === "Smoke test announcement", r.body.room?.announcements);
r = await astro("POST", "/portal/live/announcements", { text: "Call me on 9876543210" });
check("announcement with phone number blocked", r.status >= 400, r);
r = await astro("DELETE", `/portal/live/announcements/${annId}`);
r = await anon("GET", "/live-rooms/raghav");
check("deleted announcement disappears", !(r.body.room?.announcements ?? []).some((a: any) => a.id === annId), r.body.room?.announcements);

// Joining a live consult queue is private unless chosen otherwise
const joined = await db.liveQueueEntry.findFirst({ where: { roomId: "raghav", user: { email: "customer@astrorize.com" } }, orderBy: { createdAt: "desc" } });
check("queue join defaults to private", joined?.mode === "PRIVATE", { mode: joined?.mode });

// Ending live closes the room and empties the queue
r = await astro("POST", "/portal/live/end");
check("raghav ends live", r.status === 200 && r.body.ended === true && r.body.presence === "on", r);
r = await comp("GET", `/admin/monitoring/leases/${leaseId}`);
check("observer is told the live ended", r.body.status === "ended", r.body);
check("ending the live releases the observer seat", !!(await db.observerLease.findUnique({ where: { id: leaseId } }))?.releasedAt, "");
r = await anon("GET", "/live-rooms/raghav");
check("ended room is gone", r.status === 404, r);
r = await anon("GET", "/live-rooms");
check("no live rooms after ending", r.body.rooms?.length === 0, r.body);
const left = await db.liveQueueEntry.findFirst({ where: { id: joined?.id } });
check("people waiting leave the queue", left?.status === "LEFT", left?.status);

// A closed portal: no heartbeat for longer than the stale window (Config presence.offline_after_mins,
// at most 60), so switched offline automatically
await astro("POST", "/portal/live/start", { topic: "Sweep test" });
await db.astrologer.update({ where: { id: "raghav" }, data: { lastSeenAt: new Date(Date.now() - 61 * 60_000) } });
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("quiet portal reads offline at once", r.body.astrologer?.availability === "off", r.body.astrologer?.availability);
r = await anon("GET", "/live-rooms");
check("a quiet host's room isn't listed", r.body.rooms?.length === 0, r.body);
const switched = await sweepStalePresence();
const swept = await db.astrologer.findUniqueOrThrow({ where: { id: "raghav" }, include: { liveRoom: true } });
check("sweep switches raghav off and ends his live", switched.includes("raghav") && swept.presence === "OFF" && swept.liveRoom?.isLive === false, { switched, presence: swept.presence });
r = await astro("POST", "/portal/heartbeat");
check("a late heartbeat doesn't bring him back online", r.status === 200 && r.body.presence === "off", r);
r = await arjun("PATCH", "/portal/presence", { online: false });
check("arjun goes offline", r.status === 200 && r.body.online === false, r);

// Marketing department
const mkt = await login("marketing@astrorize.com");
r = await mkt("GET", "/admin/marketing");
check("marketing opens Marketing", r.status === 200, r);
r = await mkt("GET", "/admin/finance");
check("marketing can't open Finance", r.status === 403, r);
r = await mkt("POST", "/admin/campaigns/CMP-15/approve");
check("marketing can't approve a campaign", r.status === 403, r);

// Several people per department, managed by the Super Admin
r = await superA("GET", "/admin/staff");
const support = r.body.departments?.find((d: any) => d.label === "Customer Support" || d.role === "support");
check("team lists departments incl. Marketing", r.status === 200 && r.body.departments?.some((d: any) => d.role === "marketing") && (support?.people?.length ?? 0) >= 3, r.body);
r = await mkt("GET", "/admin/staff");
check("only Super Admin manages the team", r.status === 403, r);
const newEmail = `smoke.${Date.now()}@astrorize.com`;
r = await superA("POST", "/admin/staff", { name: "Smoke Tester", email: newEmail, department: "support", password: "Temp12345x" });
const staffId = r.body.id;
check("super adds a staff member", r.status === 201 && !!staffId, r);
const newbie = client();
r = await newbie("POST", "/auth/login", { email: newEmail, password: "Temp12345x" });
check("new staff member signs in", r.status === 200 && r.body.user?.adminRole === "support", r);
r = await superA("PATCH", `/admin/staff/${staffId}`, { active: false });
check("super switches them off", r.status === 200, r);
r = await newbie("GET", "/admin/support");
check("switched-off person's session ends at once", r.status === 401, r);
r = await client()("POST", "/auth/login", { email: newEmail, password: "Temp12345x" });
check("switched-off person can't sign in", r.status === 401, r);
r = await client()("POST", "/auth/login", { email: "fatima.shaikh@astrorize.com", password: "123456" });
check("seeded switched-off account refused", r.status === 401, r);

// Lifecycle list includes astrologers who aren't public
r = await superA("GET", "/admin/lifecycle/astrologers");
const ids = (r.body.astrologers ?? []).map((a: any) => a.id);
check("lifecycle lists every astrologer", r.status === 200 && ids.includes("rohit") && ids.includes("sameer") && ids.includes("raghav"), ids);

// A self-signed-up astrologer's application: submit → HR stages → activate / reject (test/application-flow.ts)
await applicationFlow(API, check);

// Admin Messages: staff, astrologers and customers; only admins start; members reply
{
  const people = async (q: string) => (await superA("GET", `/admin/messages/people?q=${encodeURIComponent(q)}`)).body.people ?? [];
  const staff = (await people("")).filter((p: any) => p.kind === "staff");
  const ragP = (await people("raghav")).find((p: any) => p.kind === "astrologer");
  const custP = (await people("9876543210")).find((p: any) => p.kind === "customer");
  check("people search: staff, astrologer, masked customer", staff.length > 0 && !!ragP && !!custP && /•/.test(custP.line) && !custP.line.includes("9876543210"), { staff, ragP, custP });
  r = await superA("POST", "/admin/messages", { memberIds: [ragP?.id, custP?.id], text: "hi" });
  check("one astrologer or customer per conversation (400)", r.status === 400, r);
  r = await astro("POST", "/admin/messages", { memberIds: [custP?.id], text: "hi" });
  check("an astrologer can't start an admin conversation (403)", r.status === 403, r);
  r = await superA("POST", "/admin/messages", { memberIds: [ragP?.id], subject: "Smoke payout check", text: "Please confirm your bank details." });
  const toRaghav = r.body.id;
  check("admin messages an astrologer", r.status === 201 && !!toRaghav, r);
  r = await astro("GET", "/portal/messages");
  const team = (r.body.threads ?? []).find((t: any) => t.id === toRaghav);
  check("astrologer sees it as Astrorize team, unread", team?.kind === "team" && /^Astrorize team/.test(team.title) && team.unread === 1, team);
  r = await astro("GET", "/portal/account");
  check("portal badge counts it", r.body.account?.counts?.messages >= 1, r.body.account?.counts);
  r = await astro("POST", `/portal/team-messages/${toRaghav}`, { text: "Confirmed, call me on 9876543210 if needed" });
  check("astrologer replies (contact details allowed with staff)", r.status === 201, r);
  r = await arjun("POST", `/portal/team-messages/${toRaghav}`, { text: "hi" });
  check("another astrologer can't reply (404)", r.status === 404, r);
  r = await superA("POST", "/admin/messages", { memberIds: [custP?.id], text: "Hello from Astrorize support." });
  const toCust = r.body.id;
  r = await cust("GET", "/messages");
  const sup = (r.body.support ?? []).find((t: any) => t.id === toCust);
  check("customer sees Astrorize support, unread", sup?.title === "Astrorize support" && sup.unread >= 1, r.body.support);
  r = await cust("GET", `/messages/support/${toCust}`);
  check("customer opens it (marks read)", r.status === 200 && r.body.conversation?.messages?.at(-1)?.author?.includes("Astrorize support"), r.body);
  r = await cust("POST", `/messages/support/${toCust}`, { text: "Thanks!" });
  check("customer replies to support", r.status === 201, r);
  const finP = staff.find((p: any) => p.line === "Finance");
  r = await superA("POST", "/admin/messages", { memberIds: [finP?.id], text: "Batch status?" });
  const toFin = r.body.id;
  r = await superA("GET", "/admin/messages/unread");
  check("admin has unread replies", r.status === 200 && r.body.unread >= 2, r.body);
  r = await superA("GET", `/admin/messages/${toRaghav}`);
  check("admin reads the astrologer's reply", r.body.conversation?.messages?.at(-1)?.author?.kind === "astrologer", r.body);
  r = await mkt("GET", `/admin/messages/${toFin}`);
  check("staff outside a conversation can't open it (404)", r.status === 404, r);
  r = await cust("GET", "/admin/messages");
  check("customers can't use admin messages (403)", r.status === 403, r);
}

// Account deactivate / delete, wallet refunds, slot reopen (HTTP only)
{
  const phone = String(6000000000 + Math.floor(Math.random() * 999999999));
  const signIn = async (c: ReturnType<typeof client>) => {
    const code = (await c("POST", "/auth/otp/request", { phone })).body.devCode;
    return c("POST", "/auth/otp/verify", { phone, code });
  };
  const acc = client();
  r = await signIn(acc);
  check("account: new customer signs up", r.status === 200 && r.body.created === true, r.body);
  const order = (await acc("POST", "/wallet/recharge", { amount: 500 })).body;
  await acc("POST", `/wallet/recharge/${order.orderId}/confirm`);
  r = await acc("GET", "/me/account");
  check("account: delete preview shows refund ₹500 and forfeited promo", r.body.account?.refund === 500 && r.body.account?.forfeited === order.bonus && r.body.account?.deleteBlocked === null, r.body);

  r = await acc("POST", "/me/account/deactivate");
  check("account: deactivate signs out everywhere", r.status === 200 && (await acc("GET", "/wallet")).status === 401, r);
  r = await signIn(acc);
  check("account: signing in again re-activates", r.status === 200 && r.body.reactivated === true && r.body.created === false, r.body);
  r = await acc("GET", "/wallet");
  check("account: wallet kept while paused", r.body.wallet?.service === 500, r.body);

  r = await acc("POST", "/me/account/delete", { code: "000000" });
  check("account: delete refuses a wrong code", r.status === 400, r);
  const code = (await acc("POST", "/me/account/delete/code")).body.devCode;
  r = await acc("POST", "/me/account/delete", { code });
  const refundRef = r.body.refund?.ref;
  check("account: delete refunds service balance only", r.status === 200 && r.body.refund?.amount === 500 && r.body.forfeited === order.bonus && /^WRF-\d+$/.test(refundRef), r.body);
  check("account: deleted customer is signed out", (await acc("GET", "/wallet")).status === 401);

  const fin = await login("finance@astrorize.com");
  r = await fin("GET", "/admin/refunds");
  const row = (r.body.refunds ?? []).find((x: any) => x.ref === refundRef);
  check("refunds: Finance sees it pending, customer anonymised", row?.status === "PENDING" && row.amount === 500 && /^Deleted customer · CUS-/.test(row.customer), row);
  r = await fin("POST", `/admin/refunds/${refundRef}/paid`, { providerRef: "" });
  check("refunds: paid needs a reference", r.status === 400, r);
  r = await fin("POST", `/admin/refunds/${refundRef}/paid`, { providerRef: "UTR12345" });
  check("refunds: Finance marks it paid", r.status === 200, r);
  r = await fin("POST", `/admin/refunds/${refundRef}/failed`, { note: "Card closed by bank" });
  check("refunds: a paid refund can't be marked failed", r.status === 409, r);
  const sup = await login("support@astrorize.com");
  r = await sup("GET", "/admin/refunds");
  check("refunds: Support can't open them (403)", r.status === 403, r);

  const again = client();
  r = await signIn(again);
  check("account: the number signs up fresh after deletion", r.status === 200 && r.body.created === true, r.body);

  // Portal: cancel an open slot, then open it again
  const astro = await login("raghav.joshi@email.com");
  const days = (await astro("GET", "/portal/availability")).body.availability.dayKeys as string[];
  // Sunday next week: always in the future.
  const date = new Date(new Date(days[6] + "T00:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const tryHours = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30"];
  let slotId: string | undefined, start = "", end = "";
  for (let i = 0; i < tryHours.length - 1 && !slotId; i++) {
    start = tryHours[i]!; end = tryHours[i + 1]!;
    const made = await astro("POST", "/portal/availability", { date, start, end });
    slotId = made.body.slot?.id;
  }
  await astro("POST", `/portal/availability/${slotId}/cancel`);
  r = await astro("POST", `/portal/availability/${slotId}/reopen`);
  const slots = (await astro("GET", `/portal/availability?week=${date}`)).body.availability.slots;
  check("portal: a cancelled future slot opens again", r.status === 200 && slots.find((s: any) => s.id === slotId)?.state === "open", r);
  await astro("POST", `/portal/availability/${slotId}/cancel`);
  const blocker = (await astro("POST", "/portal/availability", { date, start, end })).body.slot?.id;
  r = await astro("POST", `/portal/availability/${slotId}/reopen`);
  check("portal: reopening is refused when another slot overlaps", r.status === 409, r);
  await astro("POST", `/portal/availability/${blocker}/cancel`);
}

// Price lock and the welcome free call (spec AR-WEL): one 5-minute free call per mobile number, ever
{
  const freshPhone = () => String(7000000000 + Math.floor(Math.random() * 999999999));
  const signUp = async (phone: string) => {
    const c = client();
    const code = (await c("POST", "/auth/otp/request", { phone })).body.devCode;
    const res = await c("POST", "/auth/otp/verify", { phone, code });
    return { c, res };
  };
  const welcomeOf = async (c: ReturnType<typeof client>) => (await c("GET", "/wallet")).body.wallet?.welcome ?? null;
  const benefitOf = async (phone: string) => {
    const u = await db.user.findUniqueOrThrow({ where: { phone } });
    return db.welcomeBenefit.findUnique({ where: { userId: u.id } });
  };
  const hr = await login("admin@astrorize.com");
  const raghav = await login("raghav.joshi@email.com");
  r = await raghav("PATCH", "/portal/presence", { online: true });
  check("welcome: raghav online again", r.status === 200 && r.body.presence === "on", r);
  r = await anon("GET", "/astrologers/pt-raghav-joshi");
  check("welcome: raghav takes free calls (badge data) with his real multiplier", r.body.astrologer?.freeCall === true && r.body.astrologer?.instantMultiplier === 3, r.body.astrologer);

  // A new customer by mobile OTP gets one free call
  const p1 = freshPhone();
  const { c: w1 } = await signUp(p1);
  let wel = await welcomeOf(w1);
  check("welcome: granted on OTP sign-up (5 min, chat + voice)", wel?.status === "granted" && wel.available === true && wel.freeSeconds === 300 && wel.modes.join() === "chat,voice", wel);

  // Price lock: the rate the customer saw must still be the rate
  r = await w1("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT", quotedRate: 1, welcome: true });
  check("price lock: changed rate refused (409 rate_changed + new rate)", r.status === 409 && r.body.error?.code === "rate_changed" && r.body.error?.rate === 28, r);
  r = await w1("POST", "/instant-calls", { astrologerId: "raghav", quotedRate: 1 });
  check("price lock: instant call too (409 rate_changed)", r.status === 409 && r.body.error?.code === "rate_changed" && r.body.error?.rate === 84, r);
  r = await w1("POST", "/consultations", { astrologerId: "raghav", mode: "VIDEO", quotedRate: 40, welcome: true });
  check("welcome: video free call denied", r.status === 400 && r.body.error?.code === "WEL_MODALITY_DENIED", r);
  r = await w1("POST", "/instant-calls", { astrologerId: "raghav", quotedRate: 84, welcome: true });
  check("welcome: instant free call denied", r.status === 400 && r.body.error?.code === "WEL_MODALITY_DENIED", r);
  r = await w1("POST", "/consultations", { astrologerId: "meera", mode: "CHAT", welcome: true });
  check("welcome: no free call with an offline astrologer (409)", r.status === 409, r);

  // Cancelled before it connects: the free call is still theirs
  r = await w1("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT", quotedRate: 28, welcome: true });
  const cancelId = r.body.consultation?.id;
  check("welcome: free call requested with an empty wallet", r.status === 201 && r.body.consultation?.complimentary === true && r.body.consultation?.held === 0, r);
  check("welcome: reserved while requested", (await welcomeOf(w1))?.status === "reserved");
  r = await w1("POST", `/consultations/${cancelId}/end`);
  check("welcome: cancelling gives it back", r.body.status === "cancelled" && (await welcomeOf(w1))?.status === "granted", r.body);

  // Declined by the astrologer: given back (a waiting free request, set up directly)
  const u1 = await db.user.findUniqueOrThrow({ where: { phone: p1 } });
  const declined = await db.consultation.create({
    data: { ref: `SES-W${Date.now()}`, customerId: u1.id, customerAlias: "W-0001", astrologerId: "raghav", mode: "CHAT", rate: 28, status: "REQUESTED", billingMode: "COMPLIMENTARY_THEN_PAID", complimentarySeconds: 300, offeredAt: new Date() },
  });
  await db.welcomeBenefit.update({ where: { userId: u1.id }, data: { status: "RESERVED", consultationId: declined.id, reservedAt: new Date() } });
  r = await raghav("POST", `/portal/consultations/${declined.id}/reject`);
  check("welcome: a declined free request gives it back", r.status === 200 && (await benefitOf(p1))?.status === "GRANTED", r);

  // Connects → used up; with an empty wallet it ends exactly when the free time does, at ₹0
  r = await w1("POST", "/consultations", { astrologerId: "raghav", mode: "VOICE", quotedRate: 28, welcome: true });
  const freeId = r.body.consultation?.id;
  r = await w1("POST", `/consultations/${freeId}/connect`);
  check("welcome: connected free call: 300 free seconds, capped at 300", r.status === 200 && r.body.freeSeconds === 300 && r.body.maxSeconds === 300, r);
  check("welcome: connecting uses it up", (await welcomeOf(w1))?.status === "consumed");
  r = await raghav("GET", "/portal/consultations");
  check("welcome: portal marks the session as a free call", r.body.consultations?.session?.free === true && r.body.consultations?.freeCalls?.today >= 1, r.body.consultations);
  r = await anon("GET", "/astrologers/pt-raghav-joshi");
  check("welcome: busy astrologer shows no free call", r.body.astrologer?.availability === "busy" && r.body.astrologer?.freeCall === false, r.body.astrologer);

  // Daily quota: counts connected free calls only
  r = await hr("PATCH", "/admin/lifecycle/astrologers/raghav/free-calls", { dailyLimit: 51 });
  check("welcome: daily limit above 50 refused", r.status === 400, r);
  r = await hr("PATCH", "/admin/lifecycle/astrologers/raghav/free-calls", { dailyLimit: 1 });
  check("welcome: HR sets raghav's daily limit (audited)", r.status === 200 && r.body.freeCalls?.dailyLimit === 1 && !!(await db.auditLog.findFirst({ where: { action: "astrologer.free_calls.limit", object: "raghav" } })), r);

  await db.consultation.update({ where: { id: freeId }, data: { connectedAt: new Date(Date.now() - 400_000) } });
  r = await w1("POST", `/consultations/${freeId}/end`);
  const s1 = r.body.settlement;
  check("welcome: empty-wallet free call ends at the free time, ₹0", s1?.elapsed === 300 && s1?.billedMins === 0 && s1?.total === 0 && s1?.reason === "exhausted" && s1?.complimentary === true, s1);
  r = await w1("GET", "/wallet");
  check("welcome: no debit on the ledger for the free call", !(r.body.wallet?.transactions ?? []).some((t: any) => t.type === "Consultation"), r.body.wallet?.transactions);
  const ref1 = (await db.consultation.findUniqueOrThrow({ where: { id: freeId } })).ref;
  r = await raghav("GET", "/portal/earnings");
  const line1 = (r.body.earnings?.statement ?? []).find((l: any) => l.session === ref1);
  check("welcome: astrologer earns ₹0 for the free part (welcome line)", line1?.kind === "welcome" && line1.amount === 0 && line1.minutes === 0, line1);
  r = await w1("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT", quotedRate: 28, welcome: true });
  check("welcome: only once per customer", r.status === 409 && r.body.error?.code === "WEL_NOT_AVAILABLE", r);

  const p2 = freshPhone();
  const { c: w2 } = await signUp(p2);
  r = await w2("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT", quotedRate: 28, welcome: true });
  check("welcome: astrologer's daily quota reached", r.status === 409 && r.body.error?.code === "WEL_DAILY_LIMIT", r);
  r = await anon("GET", "/astrologers/pt-raghav-joshi");
  check("welcome: no free-call badge once the quota is used", r.body.astrologer?.freeCall === false, r.body.astrologer);
  r = await hr("PATCH", "/admin/lifecycle/astrologers/raghav/free-calls", { dailyLimit: null });
  check("welcome: limit back to the campaign default", r.status === 200 && r.body.freeCalls?.dailyLimit === null, r);

  // With money in the wallet the same session carries on, paid, after the free time
  const order = (await w2("POST", "/wallet/recharge", { amount: 500 })).body;
  await w2("POST", `/wallet/recharge/${order.orderId}/confirm`);
  r = await w2("POST", "/consultations", { astrologerId: "raghav", mode: "VOICE", quotedRate: 28, welcome: true });
  const paidOnId = r.body.consultation?.id;
  check("welcome: free call holds the balance for after the free time", r.status === 201 && r.body.consultation?.held === 500 + order.bonus, r);
  r = await w2("POST", `/consultations/${paidOnId}/connect`);
  check("welcome: free call can continue paid (cap past 300 s)", r.body.maxSeconds > 300, r.body);
  // A price change mid-call never affects it.
  await db.astrologer.update({ where: { id: "raghav" }, data: { price: 40 } });
  await db.consultation.update({ where: { id: paidOnId }, data: { connectedAt: new Date(Date.now() - 450_000) } });
  r = await w2("POST", `/consultations/${paidOnId}/end`);
  const s2 = r.body.settlement;
  check("welcome: 5 free min + 150 s paid = 3 min at the snapshot ₹28 = ₹84", s2?.billedMins === 3 && s2?.rate === 28 && s2?.total === 84 && s2?.promo === order.bonus, s2);
  await db.astrologer.update({ where: { id: "raghav" }, data: { price: 28 } });
  const ref2 = (await db.consultation.findUniqueOrThrow({ where: { id: paidOnId } })).ref;
  r = await raghav("GET", "/portal/earnings");
  const line2 = (r.body.earnings?.statement ?? []).find((l: any) => l.session === ref2);
  check("welcome: astrologer earns the paid minutes only, at the snapshot rate", line2?.minutes === 3 && line2.amount === 84, line2);

  // Recharging during a free call makes the same session longer without ending it
  const p3 = freshPhone();
  const { c: w3 } = await signUp(p3);
  r = await w3("POST", "/consultations", { astrologerId: "raghav", mode: "CHAT", quotedRate: 28, welcome: true });
  const topUpId = r.body.consultation?.id;
  await w3("POST", `/consultations/${topUpId}/connect`);
  const order3 = (await w3("POST", "/wallet/recharge", { amount: 500 })).body;
  await w3("POST", `/wallet/recharge/${order3.orderId}/confirm`);
  r = await w3("GET", `/consultations/${topUpId}`);
  check("welcome: mid-call recharge is held for the call (cap grows, still active)", r.body.consultation?.status === "active" && r.body.consultation?.maxSeconds > 300 && r.body.consultation?.held === 500 + order3.bonus, r.body.consultation);

  // Ended by the astrologer in its first seconds: the free call comes back (bounded, audited)
  r = await raghav("POST", `/portal/consultations/${topUpId}/end`);
  const b3 = await benefitOf(p3);
  check("welcome: early drop by the astrologer restores it", r.status === 200 && b3?.status === "GRANTED" && b3.faultRestores === 1, b3);
  check("welcome: restore is audited", !!(await db.auditLog.findFirst({ where: { action: "welcome.fault_restore" } })));

  // Deleting the account keeps the (hashed) record; the number never gets a second one
  const code = (await w1("POST", "/me/account/delete/code")).body.devCode;
  r = await w1("POST", "/me/account/delete", { code });
  check("welcome: account deleted", r.status === 200, r);
  const kept = await db.welcomeBenefit.findFirst({ where: { consultationId: freeId } });
  check("welcome: benefit row kept, unlinked", kept?.userId === null && kept.status === "CONSUMED", kept);
  const { c: again } = await signUp(p1);
  check("welcome: re-signing up with the same number grants nothing", (await welcomeOf(again)) === null);

  r = await raghav("PATCH", "/portal/presence", { online: false });
}

// Live sessions: preview and join, details set and edited while live, gifts (HTTP only)
{
  const lal = await login("lalita.bose@email.com");
  await lal("POST", "/portal/live/end"); // start from a fresh session
  await lal("PATCH", "/portal/presence", { online: true });
  r = await lal("GET", "/portal/live");
  const cats: string[] = r.body.room?.categories ?? [];
  check("live: portal offers the live categories and the astrologer's languages", cats.length > 0 && r.body.room?.languages?.includes("Bengali"), r.body.room);
  const good = { title: "Prashna hour — ask one question", topic: "Prashna hour", category: cats[0], language: "Bengali", durationMins: 45 };
  const bad: [string, object][] = [
    ["a short title", { ...good, title: "Hi" }],
    ["an unknown category", { ...good, category: "Not a category" }],
    ["a language not on the profile", { ...good, language: "Tamil" }],
    ["under 5 minutes", { ...good, durationMins: 4 }],
    ["over 480 minutes", { ...good, durationMins: 481 }],
    ["contact details in the title", { ...good, title: "Call 9876543210 now" }],
  ];
  for (const [name, body] of bad) {
    r = await lal("POST", "/portal/live/start", body);
    check(`live: going live refuses ${name} (400)`, r.status === 400, r);
  }
  r = await lal("POST", "/portal/live/start", good);
  check("live: lalita goes live with details", r.status === 201, r);
  r = await lal("PATCH", "/portal/live", { durationMins: 600 });
  check("live: edit refuses a duration over 480 (400)", r.status === 400, r);
  r = await lal("PATCH", "/portal/live", { topic: "Write to me at x@y.com" });
  check("live: edit refuses contact details (400)", r.status === 400, r);
  r = await lal("PATCH", "/portal/live", { title: "Prashna hour — open questions", durationMins: 60 });
  check("live: details edited while live", r.status === 200 && r.body.changed === true, r);
  r = await anon("GET", "/live-rooms/lalita");
  const room = r.body.room;
  check(
    "live: viewers see the edited details; the preview isn't counted",
    room?.title === "Prashna hour — open questions" && room?.topic === "Prashna hour" && room?.durationMins === 60 && room?.category === cats[0] && room?.language === "Bengali" && room?.viewers === 0,
    room,
  );
  r = await anon("POST", "/live-rooms/lalita/join");
  check("live: joining needs sign-in (401)", r.status === 401, r);

  const phone = String(6000000000 + Math.floor(Math.random() * 999999999));
  const viewer = client();
  const otpCode = (await viewer("POST", "/auth/otp/request", { phone })).body.devCode;
  await viewer("POST", "/auth/otp/verify", { phone, code: otpCode });
  r = await viewer("POST", "/live-rooms/lalita/join");
  check("live: joining counts the viewer and posts a join line", r.status === 200 && r.body.room?.viewers === 1 && r.body.room?.chat?.some((c: any) => c.kind === "join"), r.body.room);
  r = await viewer("POST", "/live-rooms/lalita/join");
  check("live: joining again posts no second join line", (r.body.room?.chat ?? []).filter((c: any) => c.kind === "join").length === 1, r.body.room?.chat);
  r = await viewer("POST", "/live-rooms/lalita/chat", { text: "write to me at someone@example.com" });
  check("live: chat refuses contact details (400)", r.status === 400, r);

  r = await viewer("GET", "/live-rooms/lalita/gifts");
  const gift = [...(r.body.gifts ?? [])].sort((x: any, y: any) => x.price - y.price)[0];
  check("live: gift catalogue lists active gifts only, with the viewer's balance", !!gift && r.body.balance === 0 && !(r.body.gifts ?? []).some((g: any) => g.name === "Honor Crown"), r.body);
  r = await viewer("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id, requestId: "smoke-gift-0001" });
  check("live: a gift without enough service balance is refused (409)", r.status === 409 && r.body.error?.code === "insufficient_balance" && /more in service balance/.test(r.body.error?.message), r);
  const order = (await viewer("POST", "/wallet/recharge", { amount: 200 })).body;
  await viewer("POST", `/wallet/recharge/${order.orderId}/confirm`);
  const before = (await viewer("GET", "/wallet")).body.wallet;
  const [g1, g2] = await Promise.all([
    viewer("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id, requestId: "smoke-gift-0002" }),
    viewer("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id, requestId: "smoke-gift-0002" }),
  ]);
  r = await viewer("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id, requestId: "smoke-gift-0002" });
  const after = (await viewer("GET", "/wallet")).body.wallet;
  const giftLines = (after?.transactions ?? []).filter((t: any) => t.type === "Gift sent");
  check(
    "live: a repeated gift request is charged once (service balance only)",
    [g1.status, g2.status].sort().join() === "200,201" && r.status === 200 && r.body.replayed === true && g1.body.gift?.id === g2.body.gift?.id &&
      after?.service === before?.service - gift?.price && after?.promo === before?.promo && giftLines.length === 1 && giftLines[0].amount === -gift?.price && giftLines[0].bucket === "Service",
    { g1, g2, before, after },
  );
  check("live: the wallet still equals its ledger", after?.service + after?.promo === (after?.transactions ?? []).reduce((s: number, t: any) => s + t.amount, 0), after);
  r = await lal("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id });
  check("live: only customers send gifts (403)", r.status === 403, r);
  r = await anon("GET", "/live-rooms/lalita");
  check("live: the room shows the gift to everyone", r.body.room?.gifts?.[0]?.id === g1.body.gift?.id && r.body.room?.chat?.some((c: any) => c.kind === "gift"), r.body.room);
  r = await lal("GET", "/portal/live/feed");
  check("live: the astrologer's console shows the gift", r.body.feed?.giftsTotal === gift?.price && r.body.feed?.gifts?.[0]?.id === g1.body.gift?.id, r.body.feed);
  r = await lal("GET", "/portal/earnings");
  const giftRow = (r.body.earnings?.statement ?? []).find((l: any) => l.kind === "gift");
  check("live: the gift is in the astrologer's earnings", giftRow?.gifts === gift?.price && giftRow?.amount === 0 && giftRow?.minutes === 0 && r.body.earnings?.gifts >= gift?.price, giftRow);

  r = await lal("POST", "/portal/live/end");
  check("live: lalita ends live", r.status === 200 && r.body.ended === true, r);
  r = await viewer("POST", "/live-rooms/lalita/gifts", { giftId: gift?.id, requestId: "smoke-gift-0003" });
  check("live: gifts need a live room (404)", r.status === 404, r);
  r = await lal("PATCH", "/portal/live", { title: "After the live" });
  check("live: details can't be edited when not live (409)", r.status === 409, r);
  await lal("PATCH", "/portal/presence", { online: false });
}

// Private consultations taken from a live (AR-LIVE): always private — chat, voice or video as the
// customer chooses — first come first served, one at a time, billed exactly like a direct
// consultation in that mode; private media only for its two parties; the live's sound is off for
// viewers while one is in session.
{
  const lal = await login("lalita.bose@email.com");
  await lal("POST", "/portal/live/end");
  await lal("PATCH", "/portal/presence", { online: true });
  r = await lal("POST", "/portal/live/start", { topic: "Private consult smoke" });
  check("live private: lalita goes live", r.status === 201, r);
  const rate = (await anon("GET", "/astrologers")).body.astrologers?.find((a: any) => a.id === "lalita")?.price as number;
  const videoRate = rate + 12; // the video premium, as for a direct video consultation
  const customer = async () => {
    const c = client();
    const phone = String(6000000000 + Math.floor(Math.random() * 999999999));
    const code = (await c("POST", "/auth/otp/request", { phone })).body.devCode;
    await c("POST", "/auth/otp/verify", { phone, code });
    return c;
  };
  const A = await customer();
  const B = await customer();
  r = await A("POST", "/live-rooms/lalita/join");
  r = await A("POST", "/live-rooms/lalita/queue", { quotedRate: rate });
  check("live private: an empty wallet can't join the queue (5 minutes needed)", r.status === 400 && r.body.error?.code === "insufficient_balance", r);
  for (const c of [A, B]) {
    const o = (await c("POST", "/wallet/recharge", { amount: 500 })).body;
    await c("POST", `/wallet/recharge/${o.orderId}/confirm`);
    await c("POST", "/live-rooms/lalita/join");
  }

  r = await A("POST", "/live-rooms/lalita/queue", { mode: "INSTANT", quotedRate: rate });
  check("live private: Instant Call isn't offered from a live (400)", r.status === 400, r);
  r = await A("POST", "/live-rooms/lalita/queue", { mode: "PUBLIC", consent: true, quotedRate: rate });
  check("live private: a PUBLIC request (older page) is taken as a private voice consultation", r.status === 200 && r.body.room?.queue?.inQueue === true, r);
  const entryA = await db.liveQueueEntry.findFirst({ where: { roomId: "lalita", status: "WAITING" }, orderBy: { createdAt: "desc" } });
  const cidA = entryA?.consultationId ?? "";
  const queuedA = await db.consultation.findUnique({ where: { id: cidA } });
  check(
    "live private: the request is PRIVATE with a queued LIVE consultation at the shown rate",
    entryA?.mode === "PRIVATE" && entryA?.consent === false && queuedA?.status === "QUEUED" && queuedA?.origin === "LIVE" && queuedA?.liveRoomId === "lalita" && queuedA?.mode === "VOICE" && queuedA?.rate === rate && queuedA?.heldAmount === 0,
    { entryA, queuedA },
  );
  r = await A("GET", "/consultations/active");
  check("live private: waiting in a queue isn't an open consultation", r.status === 200 && r.body.consultation === null, r.body);
  r = await B("POST", "/live-rooms/lalita/queue", { mode: "VIDEO", quotedRate: rate });
  check("live private: a video request quoted at the voice rate is refused with the video rate (409)", r.status === 409 && r.body.error?.code === "rate_changed" && r.body.error?.rate === videoRate, r);
  r = await B("POST", "/live-rooms/lalita/queue", { mode: "VIDEO", quotedRate: videoRate });
  check("live private: B queues behind A for a video consultation", r.status === 200 && r.body.room?.queue?.position === 2 && r.body.room?.myRequest?.mode === "video", r.body.room);

  // Live video credentials: viewers play only; the host publishes; ZEGO not set up → honest "not available"
  r = await B("GET", "/live-rooms/lalita/media");
  check("live media: a viewer who joined gets the play-only answer (not configured, no token)", r.status === 200 && r.body.media?.available === false && !r.body.media?.token, r.body);
  const C = await customer();
  r = await C("GET", "/live-rooms/lalita/media");
  check("live media: a viewer who didn't join gets 403", r.status === 403, r);
  r = await lal("GET", "/live-rooms/lalita/media");
  check("live media: the host gets no viewer credentials (403)", r.status === 403, r);
  r = await lal("GET", "/portal/live/media");
  check("live media: the host's broadcast answer (not configured)", r.status === 200 && r.body.media?.available === false && !r.body.media?.token, r.body);

  // Accepting: front of the queue only, becomes a real consultation with a hold
  r = await lal("GET", "/portal/live");
  const [first, second] = r.body.room?.requests ?? [];
  check("live private: only the front request can be accepted", first?.canAccept === true && second?.canAccept === false && r.body.room?.private === null, r.body.room?.requests);
  check(
    "live private: the console shows each request's mode and locked rate, and the rates per mode",
    first?.consultMode === "voice" && first?.rate === rate && second?.consultMode === "video" && second?.rate === videoRate && r.body.room?.rates?.video === videoRate && r.body.room?.rates?.chat === rate,
    { requests: r.body.room?.requests, rates: r.body.room?.rates },
  );
  r = await lal("POST", `/portal/live/requests/${second?.id}/accept`);
  check("live private: accepting out of turn is refused (409)", r.status === 409, r);
  r = await lal("POST", `/portal/live/requests/${first?.id}/accept`);
  check("live private: accepting starts A's private consultation", r.status === 200 && r.body.consultationId === cidA && r.body.rate === rate, r);
  const heldA = (await A("GET", "/wallet")).body.wallet;
  check("live private: A's balance is held for it", heldA?.held === heldA?.service + heldA?.promo && heldA?.held > 0, heldA);
  r = await B("GET", "/live-rooms/lalita");
  check(
    "live private: B sees the private banner state and no private details (sound still on until it connects)",
    r.body.room?.state === "private" && r.body.room?.private === null && r.body.room?.audioPaused === false,
    { state: r.body.room?.state, private: r.body.room?.private, audioPaused: r.body.room?.audioPaused },
  );
  r = await A("GET", "/live-rooms/lalita");
  check(
    "live private: A is asked to join a voice call",
    r.body.room?.private?.id === cidA && r.body.room?.private?.status === "connecting" && r.body.room?.private?.secondsToAnswer > 0 && r.body.room?.private?.mode === "voice" && r.body.room?.private?.window === "voice",
    r.body.room?.private,
  );
  r = await B("GET", `/consultations/${cidA}/media`);
  check("live private: another viewer never gets the private room (403)", r.status === 403, r);
  r = await B("GET", `/consultations/${cidA}/messages`);
  check("live private: another viewer can't read the private chat (403)", r.status === 403, r);
  r = await arjun("GET", `/portal/consultations/${cidA}/media`);
  check("live private: another astrologer never gets the private room (403)", r.status === 403, r);
  r = await A("GET", `/consultations/${cidA}/media`);
  check("live private: A's private media answer (voice only; not configured)", r.status === 200 && r.body.media?.available === false && r.body.media?.wants?.audio === true && r.body.media?.wants?.video === false, r.body);
  r = await lal("GET", `/portal/consultations/${cidA}/media`);
  check("live private: the host's private media answer", r.status === 200 && r.body.media?.available === false, r.body);
  r = await lal("POST", `/portal/live/requests/${second?.id}/accept`);
  check("live private: one private consultation at a time (409)", r.status === 409, r);

  r = await A("POST", "/live-rooms/lalita/private/connect");
  check("live private: A joins the call", r.status === 200 && r.body.room?.private?.status === "active", r.body.room?.private);
  r = await B("GET", "/live-rooms/lalita");
  check("live private: in session → the live's sound is paused for viewers", r.body.room?.audioPaused === true, r.body.room?.audioPaused);
  r = await anon("GET", "/astrologers");
  check("live private: lalita still shows as live (not busy)", r.body.astrologers?.find((a: any) => a.id === "lalita")?.availability === "live", r.body.astrologers?.find((a: any) => a.id === "lalita"));
  r = await lal("GET", "/portal/live/feed");
  check("live private: the console follows the private consultation", r.body.feed?.private?.id === cidA && r.body.feed?.private?.status === "active" && r.body.feed?.waiting === 1, r.body.feed);

  // 2½ minutes in (60 s free): 2 billed minutes, settled once, earnings at the locked rate
  await db.consultation.update({ where: { id: cidA }, data: { connectedAt: new Date(Date.now() - 150_000) } });
  r = await lal("POST", `/portal/consultations/${cidA}/end`);
  check("live private: the astrologer ends it — settled for 2 minutes", r.status === 200 && r.body.settlement?.billedMins === 2 && r.body.settlement?.total === 2 * rate, r.body);
  r = await A("POST", `/consultations/${cidA}/end`);
  check("live private: ending twice charges once", r.status === 200 && r.body.status === "ended" && r.body.settlement?.total === 2 * rate, r.body);
  const afterA = (await A("GET", "/wallet")).body.wallet;
  check(
    "live private: A charged once, hold released, wallet equals its ledger",
    afterA?.held === 0 &&
      afterA?.service + afterA?.promo === heldA?.service + heldA?.promo - 2 * rate &&
      (afterA?.transactions ?? []).filter((t: any) => t.type === "Consultation" && t.amount === -2 * rate).length === 1 &&
      afterA?.service + afterA?.promo === (afterA?.transactions ?? []).reduce((s: number, t: any) => s + t.amount, 0),
    afterA,
  );
  r = await lal("GET", "/portal/earnings");
  const liveLine = (r.body.earnings?.statement ?? []).find((l: any) => l.session === queuedA?.ref);
  check("live private: earnings line at the locked rate", liveLine?.minutes === 2 && liveLine?.amount === 2 * rate && /Live private/.test(liveLine?.mode), liveLine);
  r = await B("GET", "/live-rooms/lalita");
  check("live private: the room is public again, with sound", r.body.room?.state === "normal" && r.body.room?.audioPaused === false, r.body.room);
  r = await A("GET", "/live-rooms/lalita");
  check("live private: A's request shows as ended with the charge", r.body.room?.myRequest?.consultation === "ended" && r.body.room?.myRequest?.charged === 2 * rate && r.body.room?.private === null, r.body.room?.myRequest);

  // Next in line: B is accepted but never joins → withdrawn, nothing charged
  r = await lal("GET", "/portal/live");
  r = await lal("POST", `/portal/live/requests/${r.body.room?.requests?.[0]?.id}/accept`);
  const cidB = r.body.consultationId;
  check("live private: next in line accepted at the video rate", r.status === 200 && !!cidB && r.body.rate === videoRate, r);
  r = await B("GET", "/live-rooms/lalita");
  check("live private: B is asked to join a video call", r.body.room?.private?.mode === "video" && r.body.room?.private?.window === "video" && r.body.room?.private?.rate === videoRate, r.body.room?.private);
  r = await B("GET", `/consultations/${cidB}/media`);
  check("live private: B's private media answer wants camera and microphone", r.status === 200 && r.body.media?.wants?.audio === true && r.body.media?.wants?.video === true, r.body);
  await db.consultation.update({ where: { id: cidB }, data: { offeredAt: new Date(Date.now() - 10 * 60_000) } });
  r = await B("POST", "/live-rooms/lalita/private/connect");
  check("live private: joining after the window is refused (409)", r.status === 409, r);
  r = await B("GET", "/live-rooms/lalita");
  const walletB = (await B("GET", "/wallet")).body.wallet;
  check(
    "live private: unanswered → withdrawn, hold released, ₹0",
    r.body.room?.state === "normal" && r.body.room?.myRequest?.consultation === "cancelled" && r.body.room?.myRequest?.reason === "unanswered" && walletB?.held === 0 && !(walletB?.transactions ?? []).some((t: any) => t.type === "Consultation"),
    { req: r.body.room?.myRequest, walletB },
  );

  // A video consultation from the live: billed at the video rate, earnings labelled as such
  r = await B("POST", "/live-rooms/lalita/queue", { mode: "VIDEO", quotedRate: videoRate });
  r = await lal("GET", "/portal/live");
  r = await lal("POST", `/portal/live/requests/${r.body.room?.requests?.[0]?.id}/accept`);
  const cidV = r.body.consultationId;
  r = await B("POST", "/live-rooms/lalita/private/connect");
  check("live private: B joins the video call", r.status === 200 && r.body.room?.private?.status === "active" && r.body.room?.private?.mode === "video", r.body.room?.private);
  await db.consultation.update({ where: { id: cidV }, data: { connectedAt: new Date(Date.now() - 150_000) } });
  r = await B("POST", `/consultations/${cidV}/end`);
  check("live private: the video consultation is settled at the video rate", r.status === 200 && r.body.settlement?.billedMins === 2 && r.body.settlement?.total === 2 * videoRate, r.body);
  const refV = (await db.consultation.findUnique({ where: { id: cidV } }))?.ref;
  r = await lal("GET", "/portal/earnings");
  const videoLine = (r.body.earnings?.statement ?? []).find((l: any) => l.session === refV);
  check("live private: earnings line 'Live private · video'", videoLine?.minutes === 2 && videoLine?.mode === "Live private · video", videoLine);

  // Leaving the queue, and the live ending, close waiting requests at ₹0
  r = await B("POST", "/live-rooms/lalita/queue", { mode: "CHAT", quotedRate: rate });
  r = await B("POST", "/live-rooms/lalita/queue/leave");
  check("live private: leaving the queue", r.status === 200 && r.body.room?.queue?.inQueue === false && r.body.room?.myRequest?.status === "left", r.body.room);
  r = await A("POST", "/live-rooms/lalita/queue", { mode: "CHAT", quotedRate: rate });
  check("live private: a chat request at the standard rate", r.status === 200 && r.body.room?.myRequest?.mode === "chat", r.body.room?.myRequest);
  const lastEntry = await db.liveQueueEntry.findFirst({ where: { roomId: "lalita", status: "WAITING" }, orderBy: { createdAt: "desc" } });
  r = await lal("POST", "/portal/live/end");
  const closed = await db.consultation.findUnique({ where: { id: lastEntry?.consultationId ?? "" } });
  check("live private: ending the live closes waiting requests (₹0)", r.status === 200 && closed?.status === "CANCELLED" && closed?.total === 0, closed);
  await lal("PATCH", "/portal/presence", { online: false });
}

// Read state is saved: opening a conversation clears it from the badge, and it stays cleared.
{
  const ra = await login("raghav.joshi@email.com");
  const badge = async () => (await ra("GET", "/portal/account")).body.account?.counts?.messages as number;
  const before = await badge();
  r = await ra("GET", "/portal/messages");
  const unreadThread = (r.body.threads ?? []).find((t: any) => t.kind === "customer" && t.unread > 0);
  check("messages: a customer conversation shows as unread until opened", !!unreadThread && before > 0, { before, unreadThread: unreadThread?.id });
  r = await ra("POST", `/portal/messages/${unreadThread?.id}/read`);
  check("messages: opening it is saved", r.status === 200, r);
  check("messages: the badge drops by one", (await badge()) === before - 1, await badge());
  const stored = await db.messageThread.findUnique({ where: { id: unreadThread?.id ?? "" } });
  check("messages: read time stored in the database (survives restarts)", !!stored?.astrologerReadAt, stored);
  r = await (await login("meera.iyer@email.com"))("POST", `/portal/messages/${unreadThread?.id}/read`);
  check("messages: another astrologer can't mark it read (404)", r.status === 404, r);
}

// Logout revokes session
r = await cust("POST", "/auth/logout");
r = await cust("GET", "/wallet");
check("logout revokes session", r.status === 401, r);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exitCode = fail ? 1 : 0;
