import { db } from "../db.ts";
import { conflict, notFound } from "./errors.ts";
import { istDate, istTime } from "./format.ts";
import { accountView } from "./payouts.ts";
import { dueDateOf, payoutSchedule } from "./payout-schedule.ts";
import { loadTdsContext, type TdsLine } from "./tds.ts";

// An astrologer's statement for one payout batch (their monthly statement): every line paid in it,
// TDS, the final payable amount and what happened to the transfer. The screens turn it into Excel.

const STATUS: Record<string, string> = { QUEUED: "Awaiting transfer", PROCESSING: "Sent to the bank", PROCESSED: "Paid", FAILED: "Failed", REVERSED: "Returned by the bank" };

export async function batchStatement(batchId: string, astrologerId: string, opts: { approvedOnly?: boolean } = {}) {
  const batch = await db.payoutBatch.findUnique({ where: { id: batchId }, include: { lines: { where: { astrologerId }, orderBy: { date: "asc" } } } });
  const astrologer = await db.astrologer.findUnique({ where: { id: astrologerId }, select: { name: true } });
  if (!batch || !astrologer || !batch.lines.length) throw notFound("There is no statement for that payout.");
  if (opts.approvedOnly && batch.state === "DRAFT") throw conflict("The statement is available once Finance has approved the payout.");
  const [payout, account, schedule] = await Promise.all([
    db.payout.findUnique({ where: { batchId_astrologerId: { batchId, astrologerId } } }),
    db.payoutAccount.findUnique({ where: { astrologerId } }),
    payoutSchedule(),
  ]);
  const earned = batch.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const kept = (batch.tdsDetail as Record<string, TdsLine> | null)?.[astrologerId];
  const tds = payout ? { pct: payout.tdsPct, amount: payout.tds } : (kept ?? (await loadTdsContext()).compute(astrologerId, earned));
  const bank = account ? accountView(account) : null;
  const details: [string, string][] = [
    ["Payout batch", `${batch.id} · ${batch.cycle}`],
    ["Due on", batch.periodEnd ? istDate(dueDateOf(batch.periodEnd, schedule.day)) : "—"],
    ["Paid to", bank ? `${bank.holderName} · ${bank.accountMasked ? `account ${bank.accountMasked} · ${bank.ifsc}` : `UPI ${bank.upiMasked}`}` : "No payout details on file"],
    ["PAN", bank?.panMasked ?? "—"],
    ["Status", payout ? STATUS[payout.state]! : batch.state === "APPROVED" ? "Approved, not yet finalised" : batch.state === "DRAFT" ? "Draft" : "Nothing to transfer"],
    ["Bank reference (UTR)", payout?.utr ?? "—"],
    ["Payment date", payout?.paidAt ? istDate(payout.paidAt) : "—"],
  ];
  return {
    astrologer: astrologer.name,
    periodLabel: batch.cycle.replace(/^(Earnings|Free-call compensation) · /, ""),
    rangeLabel: batch.kind === "FREE_CALLS" ? "Free-call compensation" : "Payout statement",
    tdsPct: tds.pct,
    tdsAmount: tds.amount,
    includePlatform: batch.kind === "FREE_CALLS",
    details,
    rows: batch.lines.map((l) => ({
      date: istDate(l.date),
      time: istTime(l.date),
      session: l.sessionRef,
      kind: l.kind,
      mode: l.mode,
      minutes: l.minutes,
      gross: l.gross ?? l.amount ?? 0,
      sharePct: l.sharePct,
      amount: l.amount ?? 0,
      fundedBy: (l.fundedBy === "PLATFORM" ? "PLATFORM" : "CUSTOMER") as "PLATFORM" | "CUSTOMER",
    })),
  };
}
