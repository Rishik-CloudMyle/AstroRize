import Link from "next/link";
import AccessDenied from "@/components/admin/access-denied";
import AstrologersList from "@/components/admin/lifecycle/astrologers-list";
import LifecycleView from "@/components/admin/lifecycle/lifecycle-view";
import PriceRequestsView from "@/components/admin/lifecycle/price-requests";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getLifecycle, getLifecycleAstrologers } from "@/lib/admin/api";
import { getPriceRequests } from "@/lib/admin/price-changes";

export const metadata = { title: "Astrologer lifecycle" };

const TABS = [
  { view: "applications", label: "Applications", href: "/admin/lifecycle" },
  { view: "astrologers", label: "All astrologers", href: "/admin/lifecycle?view=astrologers" },
  { view: "prices", label: "Price requests", href: "/admin/lifecycle?view=prices" },
] as const;

export default async function LifecyclePage({ searchParams }: PageProps<"/admin/lifecycle">) {
  if (!(await allowed("hr"))) return <AccessDenied />;
  const sp = await searchParams;
  const view = sp.view === "astrologers" || sp.view === "prices" ? sp.view : "applications";
  // Read on every tab: the tab shows how many increases are waiting.
  const prices = await getPriceRequests();
  const app = typeof sp.app === "string" ? sp.app : undefined;
  // Opened from the console search: that astrologer's record shows straight away.
  const astrologer = typeof sp.astrologer === "string" ? sp.astrologer : undefined;

  return (
    <div>
      <PageTitle
        title="Astrologer lifecycle"
        sub="Application → interview → negotiation → pricing → training → active. Every action is checked against the latest version of the record."
      />

      <nav aria-label="Lifecycle views" className="mt-[18px] flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const on = t.view === view;
          return (
            <Link
              key={t.view}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`-mb-px border-b-2 px-3.5 pt-1 pb-2.5 text-[13.5px] font-bold whitespace-nowrap hover:no-underline max-[420px]:px-2.5 ${
                on ? "border-amber-500 text-ink hover:text-ink" : "border-transparent text-[#78716c] hover:text-ink"
              }`}
            >
              {t.label}
              {t.view === "prices" && prices.pending.length > 0 && (
                <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10.5px] font-extrabold text-ink tabular-nums">
                  {prices.pending.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {view === "prices" ? (
        <PriceRequestsView data={prices} />
      ) : view === "astrologers" ? (
        <AstrologersList key={astrologer ?? "all"} astrologers={await getLifecycleAstrologers()} initialOpen={astrologer} />
      ) : (
        <LifecycleView key={app ?? "all"} data={await getLifecycle()} initialApp={app} />
      )}
    </div>
  );
}
