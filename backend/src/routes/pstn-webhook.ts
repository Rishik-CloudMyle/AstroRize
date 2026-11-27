import express, { Router } from "express";
import { onAnswered, onHangup } from "../lib/phone-calls.ts";
import { readEvent, scrub, webhookSecretOk } from "../lib/phone/acefone.ts";

// Acefone tells us what happened on a call. In the Acefone console (API Connect → Webhook; support
// has to enable webhooks) add two, both POST, with the custom header
// "x-astrorize-secret: <ACEFONE_WEBHOOK_SECRET>":
//   "Call answered by Customer (Click to call)"  → <API address>/api/pstn/acefone/answered
//   "Call hangup (Missed or Answered)"           → <API address>/api/pstn/acefone/hangup
// The payload holds both phone numbers: it is never logged or stored.

export const pstnWebhookRouter = Router();

pstnWebhookRouter.use((req, res, next) => {
  if (!webhookSecretOk(req.get("x-astrorize-secret"))) return res.status(401).json({ error: { code: "bad_secret", message: "Not allowed." } });
  next();
});
pstnWebhookRouter.use(express.json({ limit: "64kb" }), express.urlencoded({ extended: false, limit: "64kb" }));

for (const [path, handle] of [
  ["/answered", onAnswered],
  ["/hangup", onHangup],
] as const) {
  pstnWebhookRouter.post(path, async (req, res) => {
    try {
      await handle(readEvent(req.body));
      res.json({ ok: true });
    } catch (e) {
      // An error answer makes Acefone send it again.
      console.error(`Phone webhook ${path}:`, scrub(e instanceof Error ? e.message : String(e)));
      res.status(500).json({ ok: false });
    }
  });
}
