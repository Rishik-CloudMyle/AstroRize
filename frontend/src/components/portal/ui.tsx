// Small building blocks shared by every console, translated from the prototype's inline styles.

/** h1 + grey subtitle; optional actions on the right (wraps under on phones). */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children?: React.ReactNode;
}) {
  const heading = (
    <div>
      <h1 className="m-0 font-display text-[34px] font-semibold text-ink min-[420px]:text-[38px]">{title}</h1>
      <p className="mt-1 text-[13.5px] text-stone-500">{subtitle}</p>
    </div>
  );
  if (!children) return heading;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      {heading}
      {children}
    </div>
  );
}

/** Glass card (.az-panel). `warm` uses the prototype's #f0e4d0 border. */
export function Panel({
  children,
  className = "",
  warm = false,
}: {
  children: React.ReactNode;
  className?: string;
  warm?: boolean;
}) {
  return (
    <div className={`az-panel rounded-[20px] border ${warm ? "border-line-warm" : "border-line"} ${className}`}>{children}</div>
  );
}

/** Small table header cell (uppercase, cream background). */
export function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`border-b-2 border-line bg-cream px-2.5 py-[9px] text-[11px] font-bold tracking-[.08em] whitespace-nowrap text-stone-500 uppercase ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export const tdClass = "border-b border-line-soft px-2.5 py-[11px]";
