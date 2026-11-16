import { EYEBROW } from "@/components/admin/ui";
import type { RefundSplit } from "@/lib/admin/types";

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f3e9d8] py-[5px] last:border-b-0">
      <span className="min-w-0 text-[#57534e]">
        {label}
        {hint && <span className="block text-[11px] text-[#78716c]">{hint}</span>}
      </span>
      <b className={`shrink-0 tabular-nums ${strong ? "text-ink" : "text-[#1c1917]"}`}>{value}</b>
    </div>
  );
}

/**
 * Who bears a refund or wallet credit — staff only (the customer sees just the amount). The numbers
 * come from the API, which uses the same function that books the astrologer's earnings reversal, so
 * this always matches the earnings line: Customer paid, Refund, then the astrologer share reversed and
 * the AstroRize (company) share absorbed.
 */
export function RefundSplitView({ split, className = "" }: { split: RefundSplit; className?: string }) {
  const credit = split.kind === "CREDIT";
  return (
    <div className={`rounded-xl border border-amber-200 bg-white/80 p-3 text-[13px] ${className}`} aria-label="Who bears this refund">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className={EYEBROW}>Who bears it · staff only</span>
        <span className="rounded-full bg-cream px-2 py-px text-[10px] font-extrabold text-[#78716c]">{split.final ? "Booked" : "If approved"}</span>
      </div>
      {!credit && split.paid && <Row label="Customer paid" hint="the original charge" value={split.paid} />}
      <Row label={credit ? "Wallet credit" : "Refund amount"} value={split.refund} strong />
      {credit ? (
        <p className="m-0 mt-1.5 text-[12px] font-semibold text-[#57534e]">AstroRize bears 100% — no astrologer deduction.</p>
      ) : (
        <>
          <Row
            label="Astrologer share reversed"
            hint={split.sharePct !== null ? `${split.sharePct}% share of the refund, rounded up to whole rupees` : undefined}
            value={split.astrologer}
          />
          <Row label="AstroRize (company) share absorbed" hint="refund − astrologer share" value={split.company} strong />
          {split.note && <p className="m-0 mt-1.5 text-[11.5px] text-[#78716c]">{split.note}.</p>}
        </>
      )}
    </div>
  );
}
