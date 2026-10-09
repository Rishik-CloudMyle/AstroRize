// A self-signed-up astrologer's application, end to end through the API:
// sign up → fill the wizard → submit → HR moves it through the stages (the astrologer's
// lifecycle follows) → Approve & activate with a rate → listed publicly and can go online.
// Also the rejection path. Everything it creates is removed again at the end.
//
// Runs as part of `npm test` (test/smoke.ts), or on its own against any database state:
//   node --env-file=.env test/application-flow.ts

import { db } from "../src/db.ts";

type Check = (name: string, ok: boolean, extra?: unknown) => void;
type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;

function client(api: string): Call {
  let cookie = "";
  return async (method, path, body) => {
    const r = await fetch(api + path, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k] = kv!.split("=");
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(k + "=")), kv].join("; ");
    }
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  };
}

/** Wizard answers that pass every submission check. */
function completeAnswers(name: string): Record<string, string> {
  return {
    "1-0": name, "1-1": "14 / 02 / 1986", "1-2": "Pune", "1-3": "Maharashtra",
    "2-0": "MA Jyotish", "2-1": "University of Pune", "2-2": "2009",
    "3-1": "None",
    "6-0": name, "6-1": "1234 5678 9012", "6-2": "HDFC0001234",
    "10-0": "₹35", "10-1": "35", "10-2": "", "10-3": "",
    "11-0": "yes", "11-1": "yes", "11-2": "yes", "11-3": "yes",
    "12-1": "yes",
  };
}

export async function applicationFlow(api: string, check: Check) {
  const created: string[] = []; // user ids, cleaned up at the end
  const stamp = Date.now().toString().slice(-6);

  async function signUp(tag: string) {
    const c = client(api);
    const phone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const details = {
      name: `Flow ${tag} ${stamp}`,
      email: `flow.${tag.toLowerCase()}.${stamp}@example.com`,
      phone,
      password: "FlowTest123",
      gender: "Female",
      years: 8,
      skills: ["Tarot", "Vedic"],
      languages: ["Hindi", "English"],
    };
    let r = await c("POST", "/auth/signup/astrologer/start", details);
    check(`application ${tag}: sign-up texts a code`, r.status === 200 && /^\d{6}$/.test(r.body.devCode ?? ""), r);
    r = await c("POST", "/auth/signup/astrologer", { ...details, code: r.body.devCode });
    check(`application ${tag}: astrologer account created`, r.status === 201 && r.body.user?.role === "astrologer", r);
    if (r.body.user?.id) created.push(r.body.user.id);
    return { c, name: details.name, id: r.body.user?.astrologerId as string, slug: r.body.user?.astrologerSlug as string };
  }

  const admin = client(api);
  let r = await admin("POST", "/auth/login", { email: "admin@astrorize.com", password: "Astrorize@2026" });
  check("application: HR (super admin) signs in", r.status === 200, r);
  const act = async (appId: string, action: string, body: Record<string, unknown> = {}) => {
    const cur = await admin("GET", `/admin/applicants/${appId}`);
    return admin("POST", `/admin/applicants/${appId}/${action}`, { version: cur.body.application?.version, ...body });
  };
  const lifecycleOf = async (c: Call) => (await c("GET", "/portal/account")).body.account?.status?.lifecycle;

  try {
    // ── Approve path ──
    const a = await signUp("A");
    r = await a.c("GET", "/portal/account");
    check("application A: starts in draft", r.body.account?.status?.lifecycle === "draft", r.body);
    r = await a.c("POST", "/portal/application/submit");
    check("application A: an empty draft can't be submitted", r.status === 400 && /Finish these/.test(r.body.error?.message), r);
    r = await a.c("GET", "/portal/application");
    check("application A: the wizard lists what's missing", r.body.application?.missing?.length > 5 && r.body.application?.editable === true, r.body);

    r = await a.c("PUT", "/portal/application", { currentStep: 12, values: { ...completeAnswers(a.name), _submittedAt: "2020-01-01T00:00:00Z" } });
    check("application A: answers saved", r.status === 200, r);
    r = await a.c("GET", "/portal/application");
    const missing = r.body.application?.missing ?? [];
    check("application A: only the bio is missing, platform keys can't be written", missing.length === 1 && missing[0].step === 8 && r.body.application?.submittedOn === null && !("_submittedAt" in (r.body.application?.values ?? {})), r.body.application);
    r = await a.c("POST", "/portal/profile/submission", { bio: "Tarot reader and Vedic astrologer with eight years of practice.", skills: ["Tarot", "Vedic"] });
    check("application A: bio submitted for review", r.status === 201, r);

    const [s1, s2] = await Promise.all([a.c("POST", "/portal/application/submit"), a.c("POST", "/portal/application/submit")]);
    check("application A: double submit creates one application", [s1.status, s2.status].sort().join() === "200,201" && [s1, s2].some((x) => x.body.alreadySubmitted === true), [s1, s2]);
    const appId: string = (s1.body.applicationId ?? s2.body.applicationId) as string;
    check("application A: gets an APP- id", /^APP-\d{4,}$/.test(appId ?? ""), appId);
    r = await a.c("GET", "/portal/account");
    check("application A: portal shows under review with the date", r.body.account?.status?.lifecycle === "review" && !!r.body.account?.status?.submittedOn, r.body.account?.status);
    r = await a.c("PUT", "/portal/application", { currentStep: 0, values: completeAnswers(a.name) });
    check("application A: wizard is read-only once sent", r.status === 409, r);
    r = await a.c("PATCH", "/portal/presence", { online: true });
    check("application A: can't go online before approval", r.status === 403, r);

    r = await admin("GET", "/admin/lifecycle");
    const row = r.body.lifecycle?.applications?.find((x: any) => x.id === appId);
    check("application A: HR sees it under review", row?.state === "Under review" && row?.fromPortal === true && row?.name === a.name, row);
    r = await admin("GET", `/admin/applicants/${appId}`);
    check("application A: HR sees the answers (bank masked)", r.body.application?.portal?.requestedRate === 35 && r.body.application.portal.answers.some((x: any) => x.label === "Bank" && /••••9012/.test(x.value) && !/123456789012/.test(x.value)), r.body.application?.portal);
    r = await admin("POST", `/admin/applicants/${appId}/advance`, { version: 999 });
    check("application A: stale version refused", r.status === 409, r);
    r = await act(appId, "activate", { rate: 30 });
    check("application A: can't activate before Training", r.status === 409, r);

    r = await act(appId, "request-info", { reason: "Please upload a clearer PAN card." });
    check("application A: request info → Docs pending", r.body.application?.state === "Docs pending", r);
    r = await a.c("GET", "/portal/account");
    check("application A: portal shows docs with HR's note", r.body.account?.status?.lifecycle === "docs" && r.body.account?.status?.note === "Please upload a clearer PAN card.", r.body.account?.status);
    r = await a.c("PUT", "/portal/application", { currentStep: 7, values: { ...completeAnswers(a.name), "3-1": "Astrotalk" } });
    check("application A: editable again while HR waits", r.status === 200, r);
    r = await a.c("POST", "/portal/application/submit");
    check("application A: update sent back to HR", r.status === 201 && r.body.applicationId === appId, r);
    r = await admin("GET", `/admin/applicants/${appId}`);
    check("application A: same application, back under review", r.body.application?.state === "Under review", r.body.application);

    const path: [string, string, string][] = [
      ["interview", "Interview", "interview"],
      ["advance", "Negotiation", "negotiation"],
      ["advance", "Pricing", "pricing"],
      ["advance", "Training", "training"],
    ];
    for (const [action, state, lifecycle] of path) {
      r = await act(appId, action);
      const now = await lifecycleOf(a.c);
      check(`application A: ${action} → ${state}, portal shows ${lifecycle}`, r.body.application?.state === state && now === lifecycle, { r, now });
    }
    r = await act(appId, "advance");
    check("application A: no stage after Training (activate instead)", r.status === 409 && /Approve/.test(r.body.error?.message), r);
    r = await act(appId, "activate", {});
    check("application A: activate needs a rate", r.status === 400, r);
    r = await act(appId, "activate", { rate: 30.5 });
    check("application A: rate must be whole rupees", r.status === 400, r);
    r = await act(appId, "activate", { rate: 5000 });
    check("application A: rate has an upper bound", r.status === 400, r);
    const anon = client(api);
    r = await anon("GET", "/astrologers");
    check("application A: not public before activation", !r.body.astrologers?.some((x: any) => x.id === a.id), r.body.astrologers?.map((x: any) => x.id));
    r = await act(appId, "activate", { rate: 30 });
    check("application A: approved & activated", r.status === 200 && r.body.astrologer?.price === 30, r);
    r = await admin("GET", "/admin/lifecycle");
    check("application A: leaves the open queue", !r.body.lifecycle?.applications?.some((x: any) => x.id === appId), r.body.lifecycle?.applications?.map((x: any) => x.id));
    r = await anon("GET", "/astrologers");
    const listed = r.body.astrologers?.find((x: any) => x.id === a.id);
    check("application A: listed publicly at ₹30", listed?.price === 30, listed ?? r.body.astrologers?.map((x: any) => x.id));
    r = await anon("GET", `/astrologers/${a.slug}`);
    check("application A: public profile opens", r.status === 200 && r.body.astrologer?.price === 30, r.status);
    r = await a.c("GET", "/portal/account");
    check("application A: portal shows active, offline", r.body.account?.status?.lifecycle === "active" && r.body.account?.online === false, r.body.account);
    r = await a.c("PATCH", "/portal/presence", { online: true });
    check("application A: can go online", r.status === 200 && r.body.online === true, r);
    await a.c("PATCH", "/portal/presence", { online: false });
    r = await a.c("POST", "/portal/application/submit");
    check("application A: nothing to resubmit once approved", r.status === 409, r);

    // ── Reject path ──
    const b = await signUp("B");
    await b.c("PUT", "/portal/application", { currentStep: 12, values: completeAnswers(b.name) });
    await b.c("POST", "/portal/profile/submission", { bio: "Vedic astrologer focused on careers and family questions.", skills: ["Vedic"] });
    r = await b.c("POST", "/portal/application/submit");
    const bApp = r.body.applicationId as string;
    check("application B: submitted", r.status === 201 && !!bApp && bApp !== appId, r);
    r = await act(bApp, "reject", { reason: "" });
    check("application B: rejection needs a reason", r.status >= 400, r);
    r = await act(bApp, "reject", { reason: "Practice history could not be verified." });
    check("application B: rejected", r.status === 200 && r.body.removed === true, r);
    r = await b.c("GET", "/portal/account");
    check("application B: portal shows rejected with the reason", r.body.account?.status?.lifecycle === "rejected" && r.body.account?.status?.note === "Practice history could not be verified.", r.body.account?.status);
    r = await b.c("POST", "/portal/application/submit");
    check("application B: can't resubmit a rejected application", r.status === 409, r);
    r = await anon("GET", "/astrologers");
    check("application B: not public", !r.body.astrologers?.some((x: any) => x.id === b.id), null);

    // Older applications entered by HR (no portal account) behave as before.
    r = await admin("GET", "/admin/lifecycle");
    const legacy = r.body.lifecycle?.applications?.find((x: any) => !x.fromPortal);
    if (legacy) {
      r = await admin("GET", `/admin/applicants/${legacy.id}`);
      check("application: HR-entered applications have no portal answers", r.status === 200 && r.body.application?.portal === null, r.body.application);
      r = await act(legacy.id, "activate", { rate: 30 });
      check("application: HR-entered applications can't be activated", r.status === 409, r);
    }
  } finally {
    // Remove the test accounts (their audit entries stay, as audit entries do).
    const astros = await db.astrologer.findMany({ where: { userId: { in: created } }, select: { id: true } });
    const astroIds = astros.map((x) => x.id);
    await db.applicant.deleteMany({ where: { astrologerId: { in: astroIds } } });
    await db.profileSubmission.deleteMany({ where: { astrologerId: { in: astroIds } } });
    await db.astrologer.deleteMany({ where: { id: { in: astroIds } } });
    await db.session.deleteMany({ where: { userId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
  }
}

if (import.meta.main) {
  const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`;
  let pass = 0, fail = 0;
  await applicationFlow(API, (name, ok, extra) => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(extra)}`);
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exitCode = fail ? 1 : 0;
}
