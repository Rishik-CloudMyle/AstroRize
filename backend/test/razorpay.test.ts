// Razorpay signature checks and refund arithmetic. No database, no network, no real keys.
//   node test/razorpay.test.ts
// (The recharge routes themselves are covered by test/smoke.ts against a running API.)

import { createHmac } from "node:crypto";
import type { RefundPart } from "../src/lib/wallet-refunds.ts";

// The modules read config at import; give them throwaway values (the database address points
// nowhere, and nothing here queries it) so this never touches a real database or real keys.
process.env.SESSION_SECRET = "unit-test-session-secret-at-least-32-characters";
process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
const { checkoutSignatureValid, noteOf, toPaise, webhookSignatureValid } = await import("../src/lib/razorpay.ts");
const { refundProgress } = await import("../src/lib/wallet-refunds.ts");

let fail = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const SECRET = "test_secret_for_unit_tests_only";
const hmac = (data: string | Buffer, key = SECRET) => createHmac("sha256", key).update(data).digest("hex");

// Checkout: HMAC-SHA256("order_id|payment_id", key secret)
const sig = hmac("order_ABC123|pay_XYZ789");
check("checkout: a correct signature passes", checkoutSignatureValid("order_ABC123", "pay_XYZ789", sig, SECRET));
check("checkout: upper-case hex passes too", checkoutSignatureValid("order_ABC123", "pay_XYZ789", sig.toUpperCase(), SECRET));
check("checkout: another payment id fails", !checkoutSignatureValid("order_ABC123", "pay_OTHER", sig, SECRET));
check("checkout: another order id fails", !checkoutSignatureValid("order_OTHER", "pay_XYZ789", sig, SECRET));
check("checkout: another secret fails", !checkoutSignatureValid("order_ABC123", "pay_XYZ789", hmac("order_ABC123|pay_XYZ789", "other"), SECRET));
check("checkout: a truncated signature fails", !checkoutSignatureValid("order_ABC123", "pay_XYZ789", sig.slice(0, 40), SECRET));
check("checkout: non-hex fails", !checkoutSignatureValid("order_ABC123", "pay_XYZ789", "z".repeat(64), SECRET));
check("checkout: empty signature fails", !checkoutSignatureValid("order_ABC123", "pay_XYZ789", "", SECRET));
check("checkout: no secret configured fails", !checkoutSignatureValid("order_ABC123", "pay_XYZ789", hmac("order_ABC123|pay_XYZ789", ""), ""));

// Webhook: HMAC-SHA256(raw body, webhook secret)
const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 23600 } } } }));
const wsig = hmac(body);
check("webhook: a correct signature passes", webhookSignatureValid(body, wsig, SECRET));
check("webhook: one changed byte fails", !webhookSignatureValid(Buffer.from(body.toString().replace("23600", "23601")), wsig, SECRET));
check("webhook: re-serialised JSON (spaces) fails", !webhookSignatureValid(Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 1)), wsig, SECRET));
check("webhook: missing header fails", !webhookSignatureValid(body, undefined, SECRET));
check("webhook: no webhook secret configured fails", !webhookSignatureValid(body, hmac(body, ""), ""));

// Helpers
check("paise: ₹236 → 23600", toPaise(236) === 23600);
check("notes: read back", noteOf({ notes: { walletRefund: "WRF-12345" } }, "walletRefund") === "WRF-12345");
check("notes: Razorpay's empty [] reads as none", noteOf({ notes: [] }, "walletRefund") === null);

// Refund progress: processed + pending count against the amount; failed parts don't.
const part = (amount: number, status: RefundPart["status"]): RefundPart => ({
  paymentId: "p", rzpPaymentId: "pay_x", amount, receipt: "r", refundId: "rfnd_x", status, at: new Date(0).toISOString(),
});
let p = refundProgress(700, [part(500, "processed"), part(200, "pending")]);
check("refunds: 500 processed + 200 pending of 700 → nothing left", p.processed === 500 && p.inFlight === 200 && p.remaining === 0);
p = refundProgress(700, [part(500, "processed"), part(200, "failed")]);
check("refunds: a failed part goes back to 'remaining'", p.processed === 500 && p.inFlight === 0 && p.remaining === 200);
p = refundProgress(900, [part(500, "processed")]);
check("refunds: what Razorpay couldn't cover stays to pay by hand", p.remaining === 400);
p = refundProgress(300, []);
check("refunds: nothing sent yet", p.remaining === 300 && p.processed === 0);

console.log(fail ? `\n${fail} failed` : "\nAll passed");
process.exit(fail ? 1 : 0);
