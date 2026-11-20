// Made-up payout details for the demo astrologers, so payouts can be tried end to end without real
// bank data. Insert-only: an astrologer who already has payout details is never touched.
//
//   node --env-file-if-exists=.env prisma/test-payout-accounts.ts      (add them to an existing database)
//
// ⚠ Test details only. None of these accounts exist; in RazorpayX test mode they are the usual
// pretend ones. Lalita's UPI id is the "fails" one, to try the failed-payout and retry flow.

import { db } from "../src/db.ts";
import { saveAccount, type AccountInput } from "../src/lib/payouts.ts";

export const TEST_ACCOUNTS: Record<string, AccountInput> = {
  raghav: { kind: "BANK", holderName: "Raghav Joshi (TEST)", accountNumber: "50100234567801", ifsc: "HDFC0001234", pan: "ABCPJ1001K" },
  meera: { kind: "BANK", holderName: "Meera Iyer (TEST)", accountNumber: "123456789012", ifsc: "ICIC0002345", pan: "ABCPI2002L" },
  arjun: { kind: "UPI", holderName: "Arjun Deshmukh (TEST)", upiId: "success@razorpay", pan: "ABCPD3003M" },
  sneha: { kind: "BANK", holderName: "Sneha Ramanathan (TEST)", accountNumber: "30011223344556", ifsc: "SBIN0003456", pan: "ABCPR4004N" },
  vikram: { kind: "UPI", holderName: "Vikram Sethi (TEST)", upiId: "success@razorpay", pan: "ABCPS5005P" },
  lalita: { kind: "UPI", holderName: "Lalita Bose (TEST — payout fails)", upiId: "failure@razorpay", pan: "ABCPB6006Q" },
};

/** Made-up details for an astrologer not listed above: stable, valid-looking, and clearly test. */
function generated(id: string, name: string): AccountInput {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 100000000;
  const digits = String(10000000 + (h % 80000000)).padStart(8, "0");
  return { kind: "BANK", holderName: `${name} (TEST)`, accountNumber: `7000${digits}`, ifsc: "HDFC0000001", pan: `ABCPT${digits.slice(0, 4)}Z` };
}

/** Test details for every active astrologer who has none. Never touches existing details. */
export async function addTestPayoutAccounts() {
  let added = 0;
  const astrologers = await db.astrologer.findMany({ where: { lifecycle: "active" }, select: { id: true, name: true } });
  for (const a of astrologers) {
    if (await db.payoutAccount.findUnique({ where: { astrologerId: a.id }, select: { astrologerId: true } })) continue;
    await saveAccount(a.id, TEST_ACCOUNTS[a.id] ?? generated(a.id, a.name), { isTest: true });
    added++;
  }
  return added;
}

// Run directly (not when the seed imports it).
if (process.argv[1]?.endsWith("test-payout-accounts.ts")) {
  addTestPayoutAccounts()
    .then(async (n) => {
      console.log(`Added test payout details for ${n} astrologer(s).`);
      await db.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await db.$disconnect();
      process.exit(1);
    });
}
