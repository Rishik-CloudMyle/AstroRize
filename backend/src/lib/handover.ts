import { db } from "../db.ts";
import { audit } from "./audit.ts";

// Super Admin handover: the role given to someone else for a time or for good. When it ends (time up, or a
// Super Admin takes it back) an account made for it is switched off, and a promoted colleague goes back to
// the department they came from. Their sessions end at once either way. There is always another active
// Super Admin left: if there isn't, the handover simply stays and is reported.

type HandoverRow = NonNullable<Awaited<ReturnType<typeof db.adminHandover.findFirst>>>;

export async function endHandover(h: HandoverRow, state: "ENDED" | "REVOKED", by: string | null) {
  const others = await db.user.count({ where: { role: "ADMIN", adminRole: "SUPER", active: true, id: { not: h.userId } } });
  if (others === 0) {
    console.warn(`[handover] ${h.id}: not ended, it would leave no other active Super Admin.`);
    return false;
  }
  const user = await db.user.findUnique({ where: { id: h.userId } });
  await db.$transaction(async (tx) => {
    if (user) {
      if (h.createdAccount) await tx.user.update({ where: { id: user.id }, data: { active: false } });
      else if (h.previousRole) await tx.user.update({ where: { id: user.id }, data: { adminRole: h.previousRole } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await tx.adminHandover.update({ where: { id: h.id }, data: { state, endedAt: new Date() } });
  });
  const how = state === "ENDED" ? "time ran out" : `taken back${by ? ` by ${by}` : ""}`;
  await audit(null, state === "ENDED" ? "admin.handover.end" : "admin.handover.revoke", `staff:${user?.email ?? h.userId}`, `${how} · ${h.createdAccount ? "account switched off" : "back to their department"}`);
  return true;
}

/** Ends temporary handovers whose time is up (runs every minute). */
export async function sweepHandovers(now = new Date()) {
  const due = await db.adminHandover.findMany({ where: { state: "ACTIVE", endsAt: { lt: now } }, take: 20 });
  for (const h of due) await endHandover(h, "ENDED", null);
}
