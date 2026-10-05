// Small presentational pieces repeated on every console page (server-safe, no hooks).

/** Glass card used for most plates. Never add a bg-* class to it: .az-panel owns the glass background. */
export const PANEL = "az-panel rounded-[18px] border border-line";

/** Table header cell, as in the prototype tables. */
export const TH =
  "bg-cream border-b-2 border-line px-2.5 py-[9px] text-[10.5px] font-bold tracking-[.08em] uppercase text-[#78716c]";
/** Smaller header cell (8px vertical padding) used by the config and negotiation tables. */
export const TH_SM =
  "bg-cream border-b-2 border-line px-2.5 py-2 text-[10.5px] font-bold tracking-[.08em] uppercase text-[#78716c]";
export const TD = "border-b border-line-soft";

/** Eyebrow label above a metric. */
export const EYEBROW = "text-[10.5px] font-bold tracking-[.08em] uppercase text-[#78716c]";

export function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="m-0 font-display text-[36px] font-semibold">{title}</h1>
      <p className="mt-1 mb-0 text-[13px] text-[#78716c]">{sub}</p>
    </div>
  );
}

/** Rounded status chip ("APPROVED", "Negotiation"…). */
export function Chip({
  children,
  bg,
  fg,
  className = "h-[22px] px-[9px] text-[11px] font-bold",
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full ${className}`} style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

/** Dashed grey stand-in for an action this actor may not take. */
export function BlockedAction({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 font-bold text-muted ${className}`}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  fg,
  subFg,
  border,
  valueSize = "text-[25px]",
}: {
  label: string;
  value: string;
  sub: string;
  fg: string;
  subFg: string;
  border: string;
  valueSize?: string;
}) {
  return (
    <div className="az-panel rounded-2xl border px-[17px] py-[15px]" style={{ borderColor: border }}>
      <div className={EYEBROW}>{label}</div>
      <b className={`mt-1 block font-bold tabular-nums ${valueSize}`} style={{ color: fg }}>
        {value}
      </b>
      <span className="text-[11px] font-semibold" style={{ color: subFg }}>
        {sub}
      </span>
    </div>
  );
}
