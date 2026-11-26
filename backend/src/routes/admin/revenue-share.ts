import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { notFound } from "../../lib/errors.ts";
import { CUSTOM_SHARE_SETTING, sharePctFor, sharePolicy } from "../../lib/earnings.ts";
import { requireCapability, requirePage } from "../../lib/rbac.ts";
import { putSetting } from "../../lib/settings.ts";

// Revenue share (Config console): the standard share every astrologer keeps (with the lower share for
// new ones, from the Config settings), and an astrologer's own share where the business agreed one.
// An own share applies to money earned from now on; earlier earnings keep the share they were booked at.
export const revenueShareRouter = Router();

revenueShareRouter.get("/revenue-share", async (req, res) => {
  requirePage(req, "config");
  const [policy, astrologers] = await Promise.all([
    sharePolicy(),
    db.astrologer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, lifecycle: true, activatedAt: true, createdAt: true } }),
  ]);
  const now = new Date();
  res.json({
    standardPct: policy.standardPct,
    newPct: policy.newPct,
    newDays: policy.newDays,
    astrologers: astrologers.map((a) => ({ id: a.id, name: a.name, status: String(a.lifecycle).toLowerCase(), customPct: policy.custom?.[a.id] ?? null, currentPct: sharePctFor(a, now, policy) })),
  });
});

const body = z.object({ pct: z.number({ error: "Enter a whole-number percentage." }).int("Use a whole-number percentage.").min(0, "A share can't be below 0%.").max(100, "A share can't be above 100%.").nullable() });

revenueShareRouter.put("/revenue-share/:id", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write", "Your role can't change revenue shares.");
  const { pct } = body.parse(req.body);
  const id = String(req.params.id);
  const a = await db.astrologer.findUnique({ where: { id }, select: { name: true } });
  if (!a) throw notFound("That astrologer doesn't exist.");
  const custom = { ...((await sharePolicy()).custom ?? {}) };
  const before = custom[id];
  if (pct === null) delete custom[id];
  else custom[id] = pct;
  await putSetting(CUSTOM_SHARE_SETTING, custom);
  await audit(admin, "config.revenue_share.update", id, `${a.name}: ${before === undefined ? "standard" : `${before}%`} → ${pct === null ? "standard" : `${pct}%`}`);
  res.json({ ok: true });
});
