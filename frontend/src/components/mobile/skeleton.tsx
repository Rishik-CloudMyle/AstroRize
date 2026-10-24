// Loading placeholders of the mobile app prototype (.skel): a soft shimmer from the hairline
// colour to white and back, 12px radius. Respects reduced motion (globals.css stops animations).
//
// <Skeleton className="h-4 w-1/2" />             one block — size it with classes
//   rounded   "md" (12px, default) | "full" (circles, pills) | "card" (16px)
// <SkeletonRows count={4} />                      stacked ListRow-shaped placeholders (44px)
//   count     how many (default 4); `label` = screen-reader text (default "Loading…")

export function Skeleton({ className = "", rounded = "md" }: { className?: string; rounded?: "md" | "full" | "card" }) {
  const radius = rounded === "full" ? "rounded-full" : rounded === "card" ? "rounded-app-card" : "rounded-[12px]";
  return (
    <span
      aria-hidden="true"
      className={`block animate-[azAppShimmer_1.2s_infinite] bg-[linear-gradient(90deg,#e7e0d6,#ffffff,#e7e0d6)] bg-size-[200%_100%] ${radius} ${className}`}
    />
  );
}

export function SkeletonRows({ count = 4, label = "Loading…", className = "" }: { count?: number; label?: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col gap-2 ${className}`}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} rounded="card" className="h-app-hit w-full" />
      ))}
    </div>
  );
}
