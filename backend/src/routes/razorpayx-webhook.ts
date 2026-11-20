import express, { Router } from "express";
import { db } from "../db.ts";
import { applyOutcome } from "../lib/payouts.ts";
import { outcomeOf, xWebhookSignatureValid, type RxPayout } from "../lib/razorpayx.ts";

// POST /api/payments/razorpayx/webhook — RazorpayX tells us what happened to a payout.
// Set it in the RazorpayX dashboard (Developer Controls → Webhooks) with the secret in
// RAZORPAYX_WEBHOOK_SECRET and the events payout.processed, payout.failed, payout.reversed,
// payout.rejected (payout.queued / payout.initiated are accepted and ignored).
//
// Signed over the exact bytes, so it is read raw (mounted before the JSON parser). Idempotent:
// RazorpayX retries until it gets a 2xx, and the sweep may already have settled the same payout.

export const razorpayxWebhookRouter = Router();

interface XEvent {
  event: string;
  payload?: { payout?: { entity: RxPayout } };
}

razorpayxWebhookRouter.post("/", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!xWebhookSignatureValid(raw, req.get("x-razorpay-signature"))) {
    return res.status(400).json({ error: { code: "bad_signature", message: "Invalid signature." } });
  }
  let event: XEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as XEvent;
  } catch {
    return res.status(400).json({ error: { code: "bad_request", message: "The request couldn't be read." } });
  }
  const entity = event.payload?.payout?.entity;
  if (entity?.id && event.event.startsWith("payout.")) {
    const ours = await db.payout.findUnique({ where: { razorpayPayoutId: entity.id } });
    // Not one of ours (another use of the same RazorpayX account): nothing to do.
    if (ours) {
      try {
        await applyOutcome(ours.id, outcomeOf(entity));
      } catch (e) {
        console.error(`RazorpayX webhook ${event.event} for ${entity.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  res.json({ ok: true });
});
