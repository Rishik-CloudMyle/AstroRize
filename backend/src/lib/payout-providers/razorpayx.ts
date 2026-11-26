import { db } from "../../db.ts";
import type { PayoutAccount } from "../../generated/prisma/client.ts";
import { MOCK_SETTLE_MS, RazorpayXError, createFundAccount, fetchPayout, outcomeOf, payoutMode, sendPayout, settleMock } from "../razorpayx.ts";
import { open } from "../secret-box.ts";
import { PayoutProviderError, fingerprintOf, type PayoutProvider, type SendJob } from "./index.ts";

// RazorpayX behind the PayoutProvider interface (the API calls are in lib/razorpayx.ts; its webhook
// is routes/razorpayx-webhook.ts). Used only with PAYOUT_PROVIDER=razorpayx.

/** Simulation only: the failing test accounts. */
const mockFails = (a: PayoutAccount) => (a.kind === "UPI" ? a.upiId === "failure@razorpay" : !!a.accountNumberEnc && open(a.accountNumberEnc).endsWith("0000"));

async function send({ amount, idempotencyKey, account }: SendJob) {
  try {
    const number = account.kind === "BANK" ? open(account.accountNumberEnc!) : account.upiId!;
    const fp = fingerprintOf(account.kind, account.holderName, number);
    let fundAccountId = account.razorpayFundAccountId;
    if (!fundAccountId || account.fundFingerprint !== fp) {
      const made = await createFundAccount({
        name: account.holderName,
        reference: account.astrologerId,
        ...(account.kind === "BANK" ? { bank: { accountNumber: number, ifsc: account.ifsc! } } : { upi: account.upiId! }),
      });
      fundAccountId = made.fundAccountId;
      await db.payoutAccount.update({
        where: { astrologerId: account.astrologerId },
        data: { razorpayContactId: made.contactId, razorpayFundAccountId: made.fundAccountId, fundFingerprint: fp },
      });
    }
    const mode = account.kind === "UPI" ? "UPI" : "IMPS";
    const sent = await sendPayout({
      fundAccountId,
      amount,
      mode,
      reference: idempotencyKey.slice(0, 40),
      narration: "AstroRize payout",
      idempotencyKey,
      mockFails: mockFails(account),
    });
    return { reference: sent.id, mode, outcome: outcomeOf(sent) };
  } catch (e) {
    if (e instanceof RazorpayXError) throw new PayoutProviderError(e.transient ? "Couldn't reach RazorpayX — trying again shortly." : e.description, e.transient);
    throw e;
  }
}

export const razorpayxProvider: PayoutProvider = {
  id: "razorpayx",
  label: "RazorpayX",
  automatic: true,
  environment: payoutMode,
  send,
  async check(reference, ageMs, account) {
    if (reference.startsWith("pout_mock_")) return ageMs < MOCK_SETTLE_MS ? null : outcomeOf(settleMock(!!account && mockFails(account), reference));
    return payoutMode() !== "mock" && ageMs > 5 * 60_000 ? outcomeOf(await fetchPayout(reference)) : null;
  },
};
