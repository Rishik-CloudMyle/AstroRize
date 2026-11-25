import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { mobileSchema } from "../../lib/contact.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istStamp } from "../../lib/format.ts";
import { endHandover } from "../../lib/handover.ts";
import { hashPassword } from "../../lib/password.ts";
import { adminOf, requireCapability, requirePage } from "../../lib/rbac.ts";
import { consumeOtp, issueOtp } from "../auth.ts";

// "My profile" for every staff member (mobile number verified by a code, password change), and the Super
// Admin handover: giving the role to someone else for a time or permanently. Granting or taking back needs
// a one-time code sent to the Super Admin's own verified mobile number.
export const handoverRouter = Router();

const mask = (phone: string) => `+91 ${phone.slice(0, 2)}••• ••${phone.slice(-3)}`;
const initialsOf = (name: string) => {
  const w = name.split(" ");
  return (w.length > 1 ? w[0]![0]! + w.at(-1)![0]! : name.slice(0, 2)).toUpperCase();
};
const actorNameOf = (name: string) => {
  const w = name.split(" ");
  return w.length > 1 ? `${w[0]![0]!.toUpperCase()}. ${w.at(-1)}` : name;
};
const passwordSchema = z
  .string({ error: "Enter a temporary password." })
  .min(10, "The password needs at least 10 characters.")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "The password needs at least one letter and one number.");
const code6 = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

// ── My profile ──

handoverRouter.get("/profile", async (req, res) => {
  const admin = adminOf(req);
  const u = await db.user.findUniqueOrThrow({ where: { id: admin.user.id } });
  const handover = await db.adminHandover.findFirst({ where: { userId: u.id, state: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  res.json({
    profile: {
      name: u.name,
      email: u.email,
      role: u.adminRole,
      phone: u.phone,
      phoneMasked: u.phone ? mask(u.phone) : null,
      handover: handover ? { kind: handover.kind, endsAtLabel: handover.endsAt ? istStamp(handover.endsAt) : null } : null,
    },
  });
});

handoverRouter.post("/profile/phone/request", async (req, res) => {
  const admin = adminOf(req);
  const phone = mobileSchema.parse(req.body?.phone);
  const taken = await db.user.findUnique({ where: { phone } });
  if (taken && taken.id !== admin.user.id) throw conflict("That number is already used by another account.");
  res.json(await issueOtp(phone, req.ip));
});

handoverRouter.post("/profile/phone/verify", async (req, res) => {
  const admin = adminOf(req);
  const { phone, code } = z.object({ phone: mobileSchema, code: code6 }).parse(req.body);
  const taken = await db.user.findUnique({ where: { phone } });
  if (taken && taken.id !== admin.user.id) throw conflict("That number is already used by another account.");
  await consumeOtp(phone, code);
  await db.user.update({ where: { id: admin.user.id }, data: { phone } });
  await audit(admin, "staff.phone.verify", `staff:${admin.user.email}`, `mobile number verified (${mask(phone)})`);
  res.json({ ok: true, phoneMasked: mask(phone) });
});

// ── Handover (Super Admin only) ──

/** Only a Super Admin hands the role over, and not one holding it for a time themselves. */
async function granter(req: Request) {
  requirePage(req, "team");
  const admin = requireCapability(req, "staff.manage", "Only a Super Admin can hand over the Super Admin role.");
  const temp = await db.adminHandover.findFirst({ where: { userId: admin.user.id, state: "ACTIVE", kind: "TEMPORARY" } });
  if (temp) throw forbidden("A temporary Super Admin can't hand the role on or take it back.");
  const me = await db.user.findUniqueOrThrow({ where: { id: admin.user.id } });
  return { admin, me };
}

type HandoverWith = Awaited<ReturnType<typeof db.adminHandover.findMany>>[number] & {
  user: { name: string | null; email: string | null };
  grantedBy: { name: string | null };
};
const view = (h: HandoverWith) => ({
  id: h.id,
  person: h.user.name,
  email: h.user.email,
  kind: h.kind,
  state: h.state,
  endsAtLabel: h.endsAt ? istStamp(h.endsAt) : null,
  createdAtLabel: istStamp(h.createdAt),
  grantedBy: h.grantedBy.name,
  note: h.note,
  newAccount: h.createdAccount,
  endedAtLabel: h.endedAt ? istStamp(h.endedAt) : null,
});

handoverRouter.get("/handovers", async (req, res) => {
  const { me } = await granter(req);
  const [list, staff] = await Promise.all([
    db.adminHandover.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true, email: true } }, grantedBy: { select: { name: true } } } }),
    db.user.findMany({ where: { role: "ADMIN", active: true, adminRole: { not: "SUPER" } }, orderBy: [{ adminRole: "asc" }, { name: "asc" }], select: { id: true, name: true, email: true, adminRole: true } }),
  ]);
  res.json({
    handovers: list.map(view),
    eligible: staff.map((s) => ({ id: s.id, name: s.name, email: s.email, department: s.adminRole })),
    phoneMasked: me.phone ? mask(me.phone) : null,
  });
});

/** Sends the confirmation code to the Super Admin's own verified mobile number. */
handoverRouter.post("/handovers/otp", async (req, res) => {
  const { me } = await granter(req);
  if (!me.phone) throw badRequest("Add and verify your mobile number in My profile first. The confirmation code is sent there.");
  const sent = await issueOtp(me.phone, req.ip);
  res.json({ ...sent, phoneMasked: mask(me.phone) });
});

const grantBody = z
  .object({
    otp: code6,
    kind: z.enum(["TEMPORARY", "PERMANENT"]),
    endsAt: z.string().optional(),
    mode: z.enum(["existing", "new"]),
    userId: z.string().max(40).optional(),
    name: z.string().trim().min(2, "Enter the person's full name.").max(60).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).optional(),
    password: passwordSchema.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.mode === "existing" || (b.name && b.email && b.password), { message: "Enter the new person's name, email and a temporary password." })
  .refine((b) => b.mode === "new" || !!b.userId, { message: "Choose who to hand over to." });

handoverRouter.post("/handovers", async (req, res) => {
  const { admin, me } = await granter(req);
  const b = grantBody.parse(req.body ?? {});
  if (!me.phone) throw badRequest("Add and verify your mobile number in My profile first.");
  let endsAt: Date | null = null;
  if (b.kind === "TEMPORARY") {
    endsAt = b.endsAt ? new Date(b.endsAt) : null;
    if (!endsAt || Number.isNaN(endsAt.getTime())) throw badRequest("Choose when the temporary handover ends.");
    if (endsAt.getTime() <= Date.now() + 60_000) throw badRequest("The end time must be in the future.");
    if (endsAt.getTime() > Date.now() + 366 * 86400_000) throw badRequest("A temporary handover can last up to a year. Choose permanent for longer.");
  }
  // Checked before the code is used up, so a typo doesn't waste it.
  const existing = b.mode === "existing" ? await db.user.findUnique({ where: { id: b.userId! } }) : null;
  if (b.mode === "existing") {
    if (!existing || existing.role !== "ADMIN" || !existing.active) throw notFound("That staff member isn't available.");
    if (existing.adminRole === "SUPER") throw conflict("That person is already a Super Admin.");
  } else if (await db.user.findUnique({ where: { email: b.email! } })) {
    throw conflict("That email is already used by another account.");
  }

  const otp = await consumeOtp(me.phone, b.otp);
  try {
    const handover = await db.$transaction(async (tx) => {
      let userId: string;
      let previousRole: "FINANCE" | "SUPPORT" | "COMPLIANCE" | "MARKETING" | "HR" | null = null;
      if (existing) {
        userId = existing.id;
        previousRole = existing.adminRole === "SUPER" ? null : existing.adminRole;
        await tx.user.update({ where: { id: existing.id }, data: { adminRole: "SUPER" } });
        // Their sign-in carries the old department: end it so they come back in as Super Admin.
        await tx.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      } else {
        const created = await tx.user.create({
          data: {
            role: "ADMIN",
            adminRole: "SUPER",
            name: b.name!,
            initials: initialsOf(b.name!),
            actorName: actorNameOf(b.name!),
            email: b.email!,
            passwordHash: await hashPassword(b.password!),
          },
        });
        userId = created.id;
      }
      return tx.adminHandover.create({ data: { userId, grantedById: me.id, kind: b.kind, endsAt, previousRole, createdAccount: !existing, note: b.note || null } });
    });
    const who = existing?.email ?? b.email;
    await audit(admin, "admin.handover.grant", `staff:${who}`, `${b.kind === "TEMPORARY" ? `temporary until ${istStamp(endsAt!)}` : "permanent"} · ${existing ? "existing colleague promoted" : "new account"}${b.note ? ` · ${b.note}` : ""}`);
    res.status(201).json({ ok: true, id: handover.id });
  } catch (e) {
    await otp.release();
    throw e;
  }
});

/** Takes the role back (needs the same confirmation code). */
handoverRouter.post("/handovers/:id/revoke", async (req, res) => {
  const { admin, me } = await granter(req);
  const { otp } = z.object({ otp: code6 }).parse(req.body ?? {});
  if (!me.phone) throw badRequest("Add and verify your mobile number in My profile first.");
  const h = await db.adminHandover.findUnique({ where: { id: String(req.params.id) } });
  if (!h || h.state !== "ACTIVE") throw notFound("That handover isn't active.");
  const code = await consumeOtp(me.phone, otp);
  if (!(await endHandover(h, "REVOKED", admin.user.name))) {
    await code.release();
    throw conflict("This would leave no other active Super Admin. Hand over to someone else first.");
  }
  res.json({ ok: true });
});
