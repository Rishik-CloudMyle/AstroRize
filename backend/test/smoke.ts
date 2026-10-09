// End-to-end check of the API against freshly seeded demo data.
//   1. npm run db:seed      (the checks expect the demo data as seeded)
//   2. npm run dev          (the API must be running)
//   3. npm test
// The application-flow checks alone (any database state): node --env-file=.env test/application-flow.ts
// Set API_URL to test through the website's proxy, e.g. API_URL=http://localhost:3000/api

import { db } from "../src/db.ts";
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
const login = async (email: string) => { const c = client(); const r = await c("POST", "/auth/login", { email, password: "Astrorize@2026" }); check(`login ${email}`, r.status === 200, r); return c; };

// Public
const anon = client();
let r = await anon("GET", "/astrologers");
check("public directory lists 6", r.status === 200 && r.body.astrologers?.length === 6, r.body);
r = await anon("GET", "/astrologers/pt-raghav-joshi");
check("profile price ₹28, instant ₹84", r.body.astrologer?.price === 28 && r.body.astrologer?.instant === 84, r.body.astrologer);
r = await anon("GET", "/live-rooms");
check("live rooms 4", r.body.rooms?.length === 4, r.body);
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

// Demo customer: recharge + consult billing
const cust = await login("customer@astrorize.com");
r = await cust("GET", "/wallet");
check("demo wallet 900 + 340", r.body.wallet?.service === 900 && r.body.wallet?.promo === 340, r.body.wallet);
r = await cust("POST", "/wallet/recharge", { amount: 500 });
check("recharge order", r.status === 201 && r.body.total === 590, r);
const orderId = r.body.orderId;
r = await cust("POST", `/wallet/recharge/${orderId}/confirm`);
check("recharge confirm", r.status === 200, r);
r = await cust("POST", `/wallet/recharge/${orderId}/confirm`);
check("confirm idempotent", r.status === 200, r);
r = await cust("GET", "/wallet");
check("wallet credited 500 + 40 bonus once", r.body.wallet?.service === 1400 && r.body.wallet?.promo === 380, r.body.wallet);
r = await cust("POST", "/consultations", { astrologerId: "arjun", mode: "VOICE" });
check("consult created", r.status === 200 || r.status === 201, r);
const cid = r.body.consultation?.id ?? r.body.id;
r = await cust("POST", `/consultations/${cid}/connect`);
check("consult connect", r.status === 200 && r.body.freeSeconds === 60, r);
// Pretend 3 min 30 s passed: 60 s free, 150 s billed → 3 minutes × ₹22 = ₹66 (promo first)
await db.consultation.update({ where: { id: cid }, data: { connectedAt: new Date(Date.now() - 210000) } });
r = await cust("POST", `/consultations/${cid}/end`);
check("settlement ₹66, 3 min", r.body.settlement && JSON.stringify(r.body.settlement).includes("66"), r.body);
r = await cust("GET", "/wallet");
check("promo used first (380−66=314)", r.body.wallet?.promo === 314 && r.body.wallet?.service === 1400, r.body.wallet);
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
const astro = await login("raghav.joshi@email.com");
for (const p of ["/account", "/dashboard", "/availability", "/consultations", "/live", "/messages", "/earnings", "/profile", "/compliance", "/application"]) {
  r = await astro("GET", "/portal" + p);
  check(`portal GET ${p}`, r.status === 200, r);
}
r = await astro("GET", "/portal/consultations");
const cons = r.body.consultations;
check("incoming + active session", !!cons?.incoming && !!cons?.session, cons);
r = await astro("POST", `/portal/consultations/${cons.incoming.id}/accept`);
check("one active consult at a time (409)", r.status === 409, r);
r = await astro("POST", `/portal/consultations/${cons.session.id}/end`);
check("end active session", r.status === 200, r);
r = await astro("POST", `/portal/consultations/${cons.incoming.id}/accept`);
check("accept incoming now", r.status === 200, r);
r = await astro("GET", "/portal/messages");
const thread = r.body.threads?.[0]?.id ?? r.body.messages?.threads?.[0]?.id;
r = await astro("POST", `/portal/messages/${thread}`, { text: "Call me on 9876543210" });
check("contact details blocked", JSON.stringify(r.body).toLowerCase().includes("contact details"), r);
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
r = await cust("GET", "/consultations/active");
check("customer is now in session", JSON.stringify(r.body).includes("ACTIVE") || JSON.stringify(r.body).toLowerCase().includes('"status":"active"'), r.body);
r = await cust("POST", `/consultations/${instantId}/end`);
check("customer ends the session", r.status === 200 && !!r.body.settlement, r);
r = await cust("GET", "/consultations/active");
check("nothing open after ending", r.status === 200 && !r.body.consultation, r.body);

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
r = await superA("POST", "/admin/payouts/PB-2026-09-B/release");
check("approver can't release payout", r.status === 403, r);
r = await fin("POST", "/admin/payouts/PB-2026-09-C/approve");
check("finance approves draft batch", r.status === 200, r);
r = await fin("POST", "/admin/payouts/PB-2026-09-C/release");
check("finance can't release", r.status === 403, r);
r = await superA("POST", "/admin/payouts/PB-2026-09-C/release");
check("super releases batch approved by finance", r.status === 200, r);
r = await sup("POST", "/admin/support/TKT-3384/refund/approve");
check("support can't approve refund", r.status === 403, r);
r = await fin("POST", "/admin/support/TKT-3384/refund/approve");
check("finance can't open Support (prototype page access)", r.status === 403, r);
r = await superA("POST", "/admin/support/TKT-3384/refund/approve");
check("super approves refund proposed by support", r.status === 200, r);
r = await sup("GET", "/admin/finance");
check("support can't open finance page", r.status === 403, r);
r = await comp("POST", "/admin/monitoring/LIVE-8804/join", {});
check("private consult can't be observed", r.status >= 400, r);
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

// Astrologer sees who is in their live queue; nobody else does
r = await astro("GET", "/portal/live");
const queue = r.body.room?.queue ?? [];
const withProfile = queue.find((q: any) => q.profile);
check("portal live lists queue with profiles", r.status === 200 && queue.length >= 3 && !!withProfile, r.body.room?.queue);
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
r = await cust("POST", "/live-rooms/sneha/queue", {});
const joined = await db.liveQueueEntry.findFirst({ where: { roomId: "sneha", user: { email: "customer@astrorize.com" } }, orderBy: { createdAt: "desc" } });
check("queue join defaults to private", r.status < 300 && joined?.mode === "PRIVATE", { status: r.status, mode: joined?.mode });

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
r = await client()("POST", "/auth/login", { email: "fatima.shaikh@astrorize.com", password: "Astrorize@2026" });
check("seeded switched-off account refused", r.status === 401, r);

// Lifecycle list includes astrologers who aren't public
r = await superA("GET", "/admin/lifecycle/astrologers");
const ids = (r.body.astrologers ?? []).map((a: any) => a.id);
check("lifecycle lists every astrologer", r.status === 200 && ids.includes("rohit") && ids.includes("sameer") && ids.includes("raghav"), ids);

// A self-signed-up astrologer's application: submit → HR stages → activate / reject (test/application-flow.ts)
await applicationFlow(API, check);

// Logout revokes session
r = await cust("POST", "/auth/logout");
r = await cust("GET", "/wallet");
check("logout revokes session", r.status === 401, r);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exitCode = fail ? 1 : 0;
