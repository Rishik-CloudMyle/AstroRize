import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDate, istStamp } from "../../lib/format.ts";
import { hashPassword } from "../../lib/password.ts";
import { ROLE_LABELS, ROLE_ORDER, requireCapability, requirePage, type AdminRoleKey } from "../../lib/rbac.ts";
import type { AdminRole } from "../../generated/prisma/client.ts";

// Team: the people in each department (Super Admin only). Several people can share a
// department, each with their own login, so one can cover when another is away.
export const staffRouter = Router();

const passwordSchema = z
  .string({ error: "Enter a temporary password." })
  .min(10, "The temporary password needs at least 10 characters.")
  .max(128, "That password is too long.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "The temporary password needs at least one letter and one number.");

/** Only a Super Admin manages staff. */
function manager(req: Request) {
  requirePage(req, "team");
  return requireCapability(req, "staff.manage", "Only a Super Admin can manage the team.");
}

function initialsOf(name: string): string {
  const words = name.split(" ");
  return (words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : name.slice(0, 2)).toUpperCase();
}

/** "Neha Gupta" → "N. Gupta" (the short name written into audit entries). */
function actorNameOf(name: string): string {
  const words = name.split(" ");
  return words.length > 1 ? `${words[0]![0]!.toUpperCase()}. ${words.at(-1)}` : name;
}

/** A staff member, or 404 when the id isn't a staff account. */
async function staffMember(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== "ADMIN" || !user.adminRole) throw notFound("No staff member with this id.");
  return user;
}

staffRouter.get("/staff", async (req, res) => {
  const admin = manager(req);
  const people = await db.user.findMany({
    where: { role: "ADMIN", adminRole: { not: null } },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
  res.json({
    departments: ROLE_ORDER.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      people: people
        .filter((p) => p.adminRole!.toLowerCase() === role)
        .map((p) => ({
          id: p.id,
          name: p.name,
          initials: p.initials,
          email: p.email,
          actorName: p.actorName ?? p.name,
          active: p.active,
          lastLogin: p.lastLoginAt ? istStamp(p.lastLoginAt) : null,
          lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
          added: istDate(p.createdAt),
          addedAt: p.createdAt.toISOString(),
          isYou: p.id === admin.user.id,
        })),
    })),
  });
});

/** Adds a person to a department with a temporary password (never sent back). */
staffRouter.post("/staff", async (req, res) => {
  const admin = manager(req);
  const body = z
    .object({
      name: z
        .string({ error: "Enter the person's full name." })
        .trim()
        .min(2, "Enter the person's full name.")
        .max(60, "Keep the name under 60 characters.")
        .transform((n) => n.replace(/\s+/g, " ")),
      email: z
        .string({ error: "Enter a valid email address." })
        .trim()
        .toLowerCase()
        .pipe(z.email("Enter a valid email address.")),
      department: z.enum(ROLE_ORDER as [AdminRoleKey, ...AdminRoleKey[]], { error: "Choose a department." }),
      password: passwordSchema,
    })
    .parse(req.body ?? {});
  if (await db.user.findUnique({ where: { email: body.email } })) throw conflict("That email is already used by another account.");
  const user = await db.user.create({
    data: {
      role: "ADMIN",
      adminRole: body.department.toUpperCase() as AdminRole,
      name: body.name,
      initials: initialsOf(body.name),
      actorName: actorNameOf(body.name),
      email: body.email,
      passwordHash: await hashPassword(body.password),
    },
  });
  await audit(admin, "staff.create", `staff:${body.email}`, `— → ${ROLE_LABELS[body.department]} · Active`);
  res.status(201).json({ ok: true, id: user.id });
});

/** Deactivate a person (signs them out everywhere at once) or activate them again. */
staffRouter.patch("/staff/:id", async (req, res) => {
  const admin = manager(req);
  const { active } = z.object({ active: z.boolean({ error: "Say whether the account should be active or deactivated." }) }).parse(req.body ?? {});
  const user = await staffMember(String(req.params.id));
  if (user.active === active) return res.json({ ok: true, active, revoked: 0 });
  if (!active && user.id === admin.user.id) throw forbidden("You can't deactivate yourself. Ask another Super Admin.");

  const revoked = await db.$transaction(async (tx) => {
    if (!active && user.adminRole === "SUPER") {
      const others = await tx.user.count({ where: { role: "ADMIN", adminRole: "SUPER", active: true, id: { not: user.id } } });
      if (others === 0) throw conflict("This is the last active Super Admin. Activate another Super Admin first.");
    }
    await tx.user.update({ where: { id: user.id }, data: { active } });
    if (active) return 0;
    const ended = await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return ended.count;
  });
  await audit(admin, active ? "staff.activate" : "staff.deactivate", `staff:${user.email}`, active ? "Deactivated → Active" : `Active → Deactivated · ${revoked} session(s) ended`);
  res.json({ ok: true, active, revoked });
});

/** Sets a new temporary password and signs the person out everywhere. */
staffRouter.post("/staff/:id/password", async (req, res) => {
  const admin = manager(req);
  const { password } = z.object({ password: passwordSchema }).parse(req.body ?? {});
  const user = await staffMember(String(req.params.id));
  // Resetting your own password keeps this browser signed in; every other session ends.
  const keep = user.id === admin.user.id ? admin.sessionId : undefined;
  const [, ended] = await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }),
    db.session.updateMany({
      where: { userId: user.id, revokedAt: null, ...(keep ? { id: { not: keep } } : {}) },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit(admin, "staff.password.reset", `staff:${user.email}`, `password reset · ${ended.count} session(s) ended`);
  res.json({ ok: true, revoked: ended.count });
});
