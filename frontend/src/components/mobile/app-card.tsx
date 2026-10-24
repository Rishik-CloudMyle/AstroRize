// The mobile app prototype's card (.card): white surface, 1px hairline border, 16px radius,
// 12px padding, a barely-there bottom shadow.
//
// <AppCard>…</AppCard>
//   as        element to render ("div" default, "section", "article", "li")
//   selected  gold border (.card.is-on)
//   padding   "md" (12px, default) | "lg" (16px) | "none"
//   tone      "surface" (white, default) | "tint" (soft gold money-hero look: cream fill, gold border)
//   className extra classes; any other HTML attribute (id, aria-*) is passed through

type CardProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  selected?: boolean;
  padding?: "md" | "lg" | "none";
  tone?: "surface" | "tint";
};

export default function AppCard({
  as: Tag = "div",
  selected = false,
  padding = "md",
  tone = "surface",
  className = "",
  children,
  ...rest
}: CardProps) {
  const pad = padding === "none" ? "" : padding === "lg" ? "p-4" : "p-3";
  const surface = tone === "tint" ? "bg-app-tint border-app-tint-3" : "bg-app-surface border-app-line";
  return (
    <Tag
      {...rest}
      className={`rounded-app-card border shadow-app-card ${surface} ${selected ? "border-app-selected!" : ""} ${pad} ${className}`}
    >
      {children}
    </Tag>
  );
}
