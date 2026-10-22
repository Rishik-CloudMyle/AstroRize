import { Router } from "express";
import { db } from "../db.ts";
import { forbidden } from "../lib/errors.ts";
import { claimOffer, discountQuote, offersFor } from "../lib/campaigns.ts";
import { istDate } from "../lib/format.ts";
import { rateLimit } from "../lib/safety.ts";
import { requireRole } from "../middleware/auth.ts";

// The offers page (/offers): live campaigns anyone can see, claimed by signed-in customers.
// "Claim first, then use" — only claimed offers apply (lib/campaigns.ts).
export const offersRouter = Router();

/** Open offers (and the signed-in customer's claims). Visitors see them too, to log in and claim. */
offersRouter.get("/", async (req, res) => {
  const customer = req.auth?.role === "customer" ? req.auth.user.id : null;
  res.json({ offers: await offersFor(customer), signedIn: !!customer });
});

/**
 * The consultation discount the customer has claimed and would get now (the consult sheet shows
 * "20% off applied"), or null.
 */
offersRouter.get("/consult-discount", async (req, res) => {
  const me = requireRole(req, "customer");
  const q = await discountQuote(me.user.id);
  res.json({ discount: q ? { campaignId: q.campaignId, name: q.name, pct: q.pct, expires: istDate(q.expiresAt) } : null });
});

offersRouter.post("/:id/claim", async (req, res) => {
  const me = requireRole(req, "customer");
  rateLimit(`claim:${me.user.id}`, 20, 60_000, "Too many tries. Wait a minute and try again.");
  if (!me.user.active) throw forbidden();
  const { claim, credited } = await claimOffer(me.user.id, String(req.params.id));
  const wallet = credited ? await db.wallet.findUnique({ where: { userId: me.user.id } }) : null;
  res.status(201).json({
    claim: { status: claim.status, expiresAt: claim.expiresAt.toISOString(), expires: istDate(claim.expiresAt), usesLeft: claim.usesLeft },
    /** ₹ added to the promotional balance (a bonus credit). */
    credited,
    promo: wallet?.promo ?? null,
  });
});
