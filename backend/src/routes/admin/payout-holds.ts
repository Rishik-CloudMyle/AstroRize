import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { istDate } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { getSetting, putSetting } from "../../lib/settings.ts";

// Payout holds (Finance page): Finance can pause an astrologer's payouts, e.g. while their bank
// details are checked. Their earnings keep accruing; their lines are left out of every batch
// prepared while paused (lib/earnings.ts holdRules) and join the first one after the hold ends.
// The astrologer's portal shows that payouts are paused, with the reason given here.
//
// Stored in Setting "payout.paused" as { [astrologerId]: hold }. Older entries are just `true`
// (no reason recorded); every reader only checks that the entry is there.

export const PAUSED_SETTING = "payout.paused";

export interface PayoutHold {
  reason: string;
  by: string;
  byId: string;
  at: string;
}

type Paused = Record<string, PayoutHold | true>;

export const payoutHoldsRouter = Router();

payoutHoldsRouter.get("/payouts/holds", async (req, res) => {
  requirePage(req, "finance");
  const [paused, astrologers] = await Promise.all([
    getSetting<Paused>(PAUSED_SETTING, {}),
    db.astrologer.findMany({ select: { id: true, name: true, lifecycle: true }, orderBy: { name: "asc" } }),
  ]);
  const byId = new Map(astrologers.map((a) => [a.id, a]));
  res.json({
    holds: Object.entries(paused)
      .filter(([id, hold]) => hold && byId.has(id))
      .map(([id, hold]) => ({
        astrologerId: id,
        name: byId.get(id)!.name,
        reason: hold === true ? null : hold.reason,
        by: hold === true ? null : hold.by,
        since: hold === true ? null : istDate(new Date(hold.at)),
      })),
    // Who can be paused: everyone with an account that can earn (not rejected applicants).
    astrologers: astrologers.filter((a) => a.lifecycle !== "rejected" && !paused[a.id]).map((a) => ({ id: a.id, name: a.name })),
  });
});

/** Pause (with a reason) or resume one astrologer's payouts. Audited. */
payoutHoldsRouter.post("/payouts/holds/:astrologerId", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.approve", "Your role can't pause or resume payouts.");
  const body = z
    .discriminatedUnion("paused", [
      z.object({
        paused: z.literal(true),
        reason: z
          .string({ error: "Write a reason." })
          .trim()
          .min(5, "Write a reason of at least 5 characters — the astrologer sees it.")
          .max(200, "Keep the reason to 200 characters."),
      }),
      z.object({ paused: z.literal(false) }),
    ])
    .parse(req.body);
  const a = await db.astrologer.findUnique({ where: { id: String(req.params.astrologerId) }, select: { id: true, name: true } });
  if (!a) throw notFound("Astrologer not found.");
  const paused = await getSetting<Paused>(PAUSED_SETTING, {});
  if (body.paused) {
    if (paused[a.id]) throw conflict(`${a.name}'s payouts are already paused.`);
    const hold: PayoutHold = { reason: body.reason, by: actorName(admin), byId: admin.user.id, at: new Date().toISOString() };
    await putSetting(PAUSED_SETTING, { ...paused, [a.id]: hold });
    await audit(admin, "payout.hold.pause", a.id, `${a.name} · payouts paused · ${body.reason}`);
  } else {
    if (!paused[a.id]) throw conflict(`${a.name}'s payouts aren't paused.`);
    const { [a.id]: _removed, ...rest } = paused;
    await putSetting(PAUSED_SETTING, rest);
    await audit(admin, "payout.hold.resume", a.id, `${a.name} · payouts resumed`);
  }
  res.json({ ok: true });
});
