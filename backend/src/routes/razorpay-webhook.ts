import express, { Router } from "express";
import { db } from "../db.ts";
import { settle } from "../lib/payments.ts";
import { webhookSignatureValid, type RzpPayment, type RzpRefund } from "../lib/razorpay.ts";
import { syncRefund } from "../lib/wallet-refunds.ts";

// POST /api/payments/razorpay/webhook — Razorpay tells us about payments and refunds.
// Configure it in the Razorpay dashboard (Webhooks) with the secret in RAZORPAY_WEBHOOK_SECRET
// and the events payment.captured, payment.failed, refund.processed, refund.failed.
//
// The signature is an HMAC of the exact bytes sent, so this route reads the raw body (it is
// mounted before the JSON parser). Every event is idempotent: Razorpay retries until it gets a
// 2xx, and the checkout's own answer or the sweep may have handled the same payment already.

export const razorpayWebhookRouter = Router();

interface WebhookEvent {
  event: string;
  payload?: { payment?: { entity: RzpPayment }; refund?: { entity: RzpRefund } };
}

razorpayWebhookRouter.post("/", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!webhookSignatureValid(raw, req.get("x-razorpay-signature"))) {
    return res.status(400).json({ error: { code: "bad_signature", message: "Invalid signature." } });
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as WebhookEvent;
  } catch {
    return res.status(400).json({ error: { code: "bad_request", message: "The request couldn't be read." } });
  }

  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  if ((event.event === "payment.captured" || event.event === "payment.failed" || event.event === "payment.authorized") && payment?.order_id) {
    const ours = await db.payment.findUnique({ where: { providerOrderId: payment.order_id } });
    // Not one of our recharge orders (another integration on the same account): nothing to do.
    if (ours && ours.provider === "razorpay") {
      try {
        await settle(ours, payment);
      } catch (e) {
        // A mismatch is logged by settle and never credited; acknowledge so Razorpay stops retrying.
        console.error(`Webhook ${event.event} for ${payment.id}:`, e instanceof Error ? e.message : e);
      }
    }
  } else if ((event.event === "refund.processed" || event.event === "refund.failed" || event.event === "refund.created") && refund) {
    await syncRefund(refund);
  }
  res.json({ ok: true });
});
