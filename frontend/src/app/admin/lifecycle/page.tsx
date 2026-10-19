import Link from "next/link";
import AccessDenied from "@/components/admin/access-denied";
import AstrologersList from "@/components/admin/lifecycle/astrologers-list";
import LifecycleView from "@/components/admin/lifecycle/lifecycle-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getLifecycle, getLifecycleAstrologers } from "@/lib/admin/api";

export const metadata = { title: "Astrologer lifecycle" };

const TABS = [
  { view: "applications", label: "Applications", href: "/admin/lifecycle" },
  { view: "astrologers", label: "All astrologers", href: "/admin/lifecycle?view=astrologers" },
] as const;

export default async function LifecyclePage({ searchParams }: PageProps<"/admin/lifecycle">) {
  if (!(await allowed("hr"))) return <AccessDenied />;
  const sp = await searchParams;
  const view = sp.view === "astrologers" ? "astrologers" : "applications";
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
              className={`-mb-px border-b-2 px-3.5 pt-1 pb-2.5 text-[13.5px] font-bold hover:no-underline ${
                on ? "border-amber-500 text-ink hover:text-ink" : "border-transparent text-[#78716c] hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {view === "astrologers" ? (
        <AstrologersList key={astrologer ?? "all"} astrologers={await getLifecycleAstrologers()} initialOpen={astrologer} />
      ) : (
        <LifecycleView key={app ?? "all"} data={await getLifecycle()} initialApp={app} />
      )}
    </div>
  );
}
