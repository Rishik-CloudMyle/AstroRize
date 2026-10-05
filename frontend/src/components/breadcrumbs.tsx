import Link from "next/link";

/** "Home / Astrologers / …" trail at the top of inner pages. */
export default function Breadcrumbs({
  items,
  className = "mb-2.5",
}: {
  items: { label: string; href?: string }[];
  /** Space below the trail: 10px on most pages, 14px on the profile and terms pages. */
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={`${className} text-[12.5px] text-stone-500`}>
      {items.map((item, i) => (
        <span key={item.label}>
          {i > 0 && " / "}
          {item.href ? (
            <Link href={item.href} className="font-semibold text-amber-700">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
