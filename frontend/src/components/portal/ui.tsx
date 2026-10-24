// Small building blocks shared by every console, translated from the prototype's inline styles.
// Below 1024px (max-lg:) they take the customer mobile app look (components/mobile/README.md):
// the page title becomes the outlined title pill, panels become plain white app cards.

/** The mobile app's title pill (.az-sec) for a portal page h1, phones/tablets only. */
export const APP_TITLE_PILL =
  "max-lg:inline-flex max-lg:h-[30px] max-lg:items-center max-lg:rounded-[8px] max-lg:border max-lg:border-app-line-gold-2 max-lg:bg-app-elev max-lg:px-3 max-lg:font-sans max-lg:text-[14px]! max-lg:leading-none max-lg:font-bold max-lg:tracking-[.01em] max-lg:text-app-ink";

/** The mobile app card (.card) look for a desktop glass panel, phones/tablets only. */
export const APP_CARD =
  "max-lg:rounded-app-card max-lg:border-app-line! max-lg:bg-app-surface max-lg:shadow-app-card! max-lg:transform-none! max-lg:[backdrop-filter:none]";

/** No card at all below 1024px (the panel's content sits straight on the page). */
const APP_PLAIN =
  "max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none! max-lg:transform-none! max-lg:[backdrop-filter:none]";

/** Phones/tablets: a text field / select as the mobile app's input (52px, 12px radius, 16px text). */
export const M_INPUT =
  "max-lg:h-[52px] max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-4 max-lg:text-[16px] max-lg:focus:border-app-selected";
/** Phones/tablets: the mobile app's field label. */
export const M_LABEL = "max-lg:text-[12px] max-lg:font-medium max-lg:text-app-ink-2";
/** Phones/tablets: the main action as the gold app button. */
export const M_PRIMARY =
  "max-lg:min-h-app-hit max-lg:rounded-app-btn max-lg:border-0 max-lg:bg-app-primary max-lg:text-[15px] max-lg:text-app-on-primary max-lg:hover:text-app-on-primary";
/** Phones/tablets: a second action as the outlined app button. */
export const M_SECONDARY =
  "max-lg:min-h-app-hit max-lg:rounded-app-btn max-lg:border max-lg:border-app-line max-lg:bg-transparent max-lg:text-[15px] max-lg:text-app-ink max-lg:hover:text-app-ink";
/** Phones/tablets: a small tinted note box inside a card. */
export const M_NOTE = "max-lg:rounded-app-btn";

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
      <h1 className={`m-0 font-display text-[34px] font-semibold text-ink min-[420px]:text-[38px] ${APP_TITLE_PILL}`}>{title}</h1>
      <p className="mt-1 text-[13.5px] text-stone-500 max-lg:mt-2 max-lg:text-[12.5px] max-lg:leading-[1.45] max-lg:text-app-ink-3">{subtitle}</p>
    </div>
  );
  if (!children) return heading;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 max-lg:gap-3">
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
  mobile = "card",
}: {
  children: React.ReactNode;
  className?: string;
  warm?: boolean;
  /** Below 1024px: "card" = an app card (default); "plain" = no card at all; "none" = className says it all. */
  mobile?: "card" | "plain" | "none";
}) {
  const phone = mobile === "card" ? `${APP_CARD} max-lg:p-4!` : mobile === "plain" ? APP_PLAIN : "";
  return (
    <div className={`az-panel rounded-[20px] border ${warm ? "border-line-warm" : "border-line"} ${className} ${phone}`}>
      {children}
    </div>
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
