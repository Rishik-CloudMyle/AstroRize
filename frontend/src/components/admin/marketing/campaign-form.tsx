"use client";

import { useId, useState } from "react";
import AdminDialog from "@/components/admin/dialog";
import { useAction } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { Campaign, CampaignKind, MarketingData } from "@/lib/admin/types";

// Marketing drafts (or edits a draft of) a campaign offer. The API checks everything again:
// the percent against marketing.campaign.max_discount_pct and the cashback floor, the bonus
// against marketing.bonus_credit.max, the dates, and outcome claims in the copy.

type Limits = Pick<MarketingData, "maxDiscountPct" | "floorPct" | "floorMode" | "floorCapPct" | "bonusMax">;

const KINDS: { key: CampaignKind; title: string; body: string }[] = [
  { key: "RECHARGE_CASHBACK", title: "Recharge cashback", body: "A percent of a recharge back as promotional credit." },
  { key: "CONSULT_DISCOUNT", title: "Consultation discount", body: "A percent off the per-minute price. AstroRize pays the discount." },
  { key: "BONUS_CREDIT", title: "Bonus credit", body: "Flat promotional credit, added when the customer claims it." },
];

const FIELD = "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-amber-500";
const LABEL = "mb-1.5 block text-[12px] font-bold text-[#57534e]";
const HINT = "mt-1 block text-[11.5px] leading-snug text-[#78716c]";

/** "" → null, else a whole number. */
const num = (s: string) => (s.trim() === "" ? null : Math.round(Number(s)));

/** Today in IST, "2026-10-22" (the smallest date the inputs accept). */
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default function CampaignForm({ campaign, limits, onClose }: { campaign: Campaign | null; limits: Limits; onClose: () => void }) {
  const id = useId();
  const { run, busy } = useAction();
  const [kind, setKind] = useState<CampaignKind>(campaign && !campaign.legacy ? campaign.kind : "RECHARGE_CASHBACK");
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [percent, setPercent] = useState(campaign?.percent?.toString() ?? "");
  const [flat, setFlat] = useState(campaign?.flatAmount?.toString() ?? "");
  const [minRecharge, setMinRecharge] = useState(campaign?.minRecharge?.toString() ?? "");
  const [maxBenefit, setMaxBenefit] = useState(campaign?.maxBenefit?.toString() ?? "");
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? "");
  const [validDays, setValidDays] = useState(String(campaign?.claimValidDays ?? 7));
  const [uses, setUses] = useState(String(campaign?.usesPerCustomer ?? 1));
  const [audience, setAudience] = useState<"ALL" | "NEW">(campaign?.audience ?? "ALL");
  const [error, setError] = useState("");

  const bonus = kind === "BONUS_CREDIT";
  const pct = num(percent);
  const applies = pct === null ? null : Math.min(pct, limits.floorCapPct);

  /** The first thing wrong, checked before the API (which checks again). */
  function problem(): string | null {
    if (name.trim().length < 3) return "Give the campaign a name of at least 3 characters.";
    if (bonus) {
      const f = num(flat);
      if (!f || f < 1) return "Set the bonus credit amount (₹).";
      if (f > limits.bonusMax) return `A bonus credit can be at most ₹${limits.bonusMax}.`;
    } else {
      if (!pct || pct < 1) return "Set the percent (1 or more).";
      if (pct > limits.maxDiscountPct) return `The percent can be at most ${limits.maxDiscountPct}%.`;
      if (limits.floorMode === "reject" && pct > limits.floorCapPct) {
        return `The ${limits.floorPct}% cashback floor allows at most ${limits.floorCapPct}%.`;
      }
      const days = num(validDays);
      if (!days || days < 1 || days > 90) return "A claim can stay valid for 1 to 90 days.";
      const u = num(uses);
      if (!u || u < 1 || u > 10) return "Uses per customer: 1 to 10.";
    }
    if (startsOn && endsOn && startsOn > endsOn) return "The end date is before the start date.";
    if (endsOn && endsOn < todayIst()) return "The end date has already passed.";
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const p = problem();
    if (p) return setError(p);
    setError("");
    const body = {
      kind,
      name: name.trim(),
      description: description.trim(),
      percent: bonus ? null : pct,
      flatAmount: bonus ? num(flat) : null,
      minRecharge: kind === "RECHARGE_CASHBACK" ? num(minRecharge) : null,
      maxBenefit: kind === "RECHARGE_CASHBACK" ? num(maxBenefit) : null,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      claimValidDays: num(validDays) ?? 7,
      usesPerCustomer: bonus ? 1 : (num(uses) ?? 1),
      audience,
    };
    const res = campaign
      ? await run(() => api.patch(`/admin/campaigns/${campaign.id}`, body), `${campaign.id} saved. Still a draft — submit it for Admin approval.`)
      : await run(
          () => api.post<{ id: string }>("/admin/campaigns", body),
          (r) => `${r.id} created as a DRAFT. Submit it for Admin approval when it's ready.`,
        );
    if (res) onClose();
  }

  return (
    <AdminDialog
      title={campaign ? `Edit ${campaign.id}` : "New campaign"}
      subtitle="Drafts only. Customers claim an offer first; it then applies by itself until the claim expires."
      onClose={onClose}
      width={640}
    >
      <form onSubmit={save} noValidate>
        <fieldset className="m-0 border-0 p-0">
          <legend className={LABEL}>Offer</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label
                key={k.key}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border-2 px-3 py-2.5 ${kind === k.key ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}
              >
                <input type="radio" name={`${id}-kind`} value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} className="sr-only" />
                <b className="text-[13px] text-ink">{k.title}</b>
                <span className="text-[11.5px] leading-snug text-[#78716c]">{k.body}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-name`} className={LABEL}>
              Name customers see
            </label>
            <input id={`${id}-name`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali cashback" className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-desc`} className={LABEL}>
              Description <span className="font-semibold text-[#a8a29e]">(optional)</span>
            </label>
            <textarea
              id={`${id}-desc`}
              value={description}
              maxLength={300}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Recharge this festive week and get part of it back as promotional credit."
              className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-amber-500"
            />
          </div>

          {bonus ? (
            <div>
              <label htmlFor={`${id}-flat`} className={LABEL}>
                Bonus credit (₹)
              </label>
              <input id={`${id}-flat`} type="number" inputMode="numeric" min={1} max={limits.bonusMax} value={flat} onChange={(e) => setFlat(e.target.value)} className={FIELD} />
              <span className={HINT}>Up to ₹{limits.bonusMax} (marketing.bonus_credit.max). Credited once, when claimed.</span>
            </div>
          ) : (
            <div>
              <label htmlFor={`${id}-pct`} className={LABEL}>
                {kind === "CONSULT_DISCOUNT" ? "Discount" : "Cashback"} (%)
              </label>
              <input id={`${id}-pct`} type="number" inputMode="numeric" min={1} max={limits.maxDiscountPct} value={percent} onChange={(e) => setPercent(e.target.value)} className={FIELD} />
              <span className={HINT}>
                Up to {limits.maxDiscountPct}%. The {limits.floorPct}% cashback floor lets at most {limits.floorCapPct}% apply
                {limits.floorMode === "adjust" ? " — more is clamped" : " — more is refused"}.
                {applies !== null && pct !== null && applies < pct && limits.floorMode === "adjust" && <b className="text-amber-800"> Applies as {applies}%.</b>}
              </span>
            </div>
          )}

          {kind === "RECHARGE_CASHBACK" && (
            <>
              <div>
                <label htmlFor={`${id}-min`} className={LABEL}>
                  Smallest recharge (₹) <span className="font-semibold text-[#a8a29e]">(optional)</span>
                </label>
                <input id={`${id}-min`} type="number" inputMode="numeric" min={0} value={minRecharge} onChange={(e) => setMinRecharge(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor={`${id}-max`} className={LABEL}>
                  Most cashback per recharge (₹) <span className="font-semibold text-[#a8a29e]">(optional)</span>
                </label>
                <input id={`${id}-max`} type="number" inputMode="numeric" min={1} value={maxBenefit} onChange={(e) => setMaxBenefit(e.target.value)} className={FIELD} />
              </div>
            </>
          )}

          <div>
            <label htmlFor={`${id}-start`} className={LABEL}>
              Starts on <span className="font-semibold text-[#a8a29e]">(blank: on approval)</span>
            </label>
            <input id={`${id}-start`} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor={`${id}-end`} className={LABEL}>
              Ends on <span className="font-semibold text-[#a8a29e]">(blank: until ended)</span>
            </label>
            <input id={`${id}-end`} type="date" min={todayIst()} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={FIELD} />
            <span className={HINT}>Claimable until the end of that day (IST).</span>
          </div>

          {!bonus && (
            <>
              <div>
                <label htmlFor={`${id}-days`} className={LABEL}>
                  Claim valid for (days)
                </label>
                <input id={`${id}-days`} type="number" inputMode="numeric" min={1} max={90} value={validDays} onChange={(e) => setValidDays(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor={`${id}-uses`} className={LABEL}>
                  Uses per customer
                </label>
                <input id={`${id}-uses`} type="number" inputMode="numeric" min={1} max={10} value={uses} onChange={(e) => setUses(e.target.value)} className={FIELD} />
                <span className={HINT}>{kind === "CONSULT_DISCOUNT" ? "Consultations it discounts." : "Recharges it adds cashback to."}</span>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label htmlFor={`${id}-aud`} className={LABEL}>
              Who can claim it
            </label>
            <select id={`${id}-aud`} value={audience} onChange={(e) => setAudience(e.target.value === "NEW" ? "NEW" : "ALL")} className={FIELD}>
              <option value="ALL">All customers</option>
              <option value="NEW">New customers (no paid consultation yet)</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-10 rounded-[10px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60">
            {busy ? "Saving…" : campaign ? "Save draft" : "Create draft"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
