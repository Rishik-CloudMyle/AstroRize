import { db } from "../db.ts";
import { audit } from "./audit.ts";
import { conflict, notFound } from "./errors.ts";
import { createPayoutsForBatch } from "./payouts.ts";
import { payoutMode } from "./razorpayx.ts";
import { actorName, secondPerson } from "./rbac.ts";
import type { AuthContext } from "../middleware/auth.ts";
import type { AdminRoleClaim } from "./session.ts";

// Approving and releasing a payout batch, shared by the Finance page (whole cycles) and the Astrologer
// payouts page (one astrologer). The two-person rule is the same everywhere: the person who approves can't
// release (a Super Admin may, and it is audited as self-approved), and a batch moves only once.

type Admin = AuthContext & { adminRole: AdminRoleClaim };

export async function approveBatch(admin: Admin, id: string) {
  const b = await db.payoutBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Payout batch not found.");
  if (b.state !== "DRAFT") throw conflict(`${b.id} is already ${b.state.toLowerCase()}.`);
  const { count } = await db.payoutBatch.updateMany({
    where: { id: b.id, state: "DRAFT" },
    data: {
      state: "APPROVED",
      approvedById: admin.user.id,
      approvedByName: actorName(admin),
      approvedRole: admin.adminRole.toUpperCase() as "SUPER" | "FINANCE" | "SUPPORT" | "COMPLIANCE" | "MARKETING" | "HR",
      approvedAt: new Date(),
    },
  });
  if (!count) throw conflict(`${b.id} was just approved by someone else.`);
  await audit(admin, "payout.batch.approve", b.id, "DRAFT → APPROVED");
  return { ok: true, actor: actorName(admin) };
}

export async function releaseBatch(admin: Admin, id: string) {
  const b = await db.payoutBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Payout batch not found.");
  if (b.state !== "APPROVED") throw conflict(`${b.id} must be approved before it can be released.`);
  const self = secondPerson(admin, b.approvedById === admin.user.id, `Blocked — you approved ${b.id}. Release requires a different actor.`);
  const { count } = await db.payoutBatch.updateMany({
    where: { id: b.id, state: "APPROVED", approvedById: b.approvedById },
    data: { state: "RELEASED", releasedById: admin.user.id, releasedByName: actorName(admin), releasedAt: new Date() },
  });
  if (!count) throw conflict(`${b.id} was just released by someone else.`);
  await audit(admin, "payout.batch.release", b.id, `APPROVED → RELEASED${self}`);
  // One transfer per astrologer through RazorpayX (or the simulation until its keys are set). A problem
  // here never undoes the release: the transfers can be sent again from the Transfers page.
  let transfers = null;
  try {
    transfers = await createPayoutsForBatch(b.id);
  } catch (e) {
    console.error(`Transfers for ${b.id}:`, e instanceof Error ? e.message : e);
  }
  return { ok: true, actor: actorName(admin), mode: payoutMode(), transfers };
}
