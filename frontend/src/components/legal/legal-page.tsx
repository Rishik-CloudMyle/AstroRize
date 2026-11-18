import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import type { Block, LegalDoc } from "@/lib/legal/types";

const card =
  "mb-3.5 scroll-mt-24 rounded-[18px] border border-line bg-paper p-5 sm:p-[22px] max-lg:mb-2 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:p-4! max-lg:shadow-app-card";
const text = "text-pretty text-sm leading-[1.65] text-stone-600 max-lg:text-[13.5px] max-lg:text-app-ink-2";

function BlockView({ b }: { b: Block }) {
  if (typeof b === "string") return <p className={`mt-2.5 first:mt-0 ${text}`}>{b}</p>;
  if ("lead" in b)
    return (
      <p className={`mt-2.5 first:mt-0 ${text}`}>
        <b className="font-semibold text-ink">{b.lead}</b> {b.text}
      </p>
    );
  if ("list" in b)
    return (
      <ul className={`mt-2.5 list-disc space-y-1.5 pl-5 first:mt-0 ${text}`}>
        {b.list.map((li) => (
          <li key={li}>{li}</li>
        ))}
      </ul>
    );
  return (
    <div className="mt-2.5 overflow-x-auto rounded-xl border border-line first:mt-0">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px] leading-[1.55] text-stone-600">
        <thead>
          <tr className="bg-stone-50 text-ink">
            {b.table.head.map((h) => (
              <th key={h} className="border-b border-line px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((r) => (
            <tr key={r[0]} className="align-top">
              {r.map((c, i) => (
                <td key={i} className="border-t border-line/70 px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A legal document (Terms, Privacy Policy, Data Deletion Policy) with a contents list. */
export default function LegalPage({ doc, related }: { doc: LegalDoc; related: { href: string; label: string }[] }) {
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <AppTopbar title={doc.title} className="lg:hidden" />
      <div className="max-lg:px-4 max-lg:pt-3">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: doc.title }]} className="mb-3.5 max-lg:hidden" />

        {doc.notice && (
          <div
            className={`rounded-[18px] border-2 px-[18px] py-[18px] text-[13px] font-bold leading-[1.55] sm:px-[22px] max-lg:rounded-app-card max-lg:p-3.5! ${
              doc.notice.kind === "danger" ? "border-rose-700 bg-rose-50 text-rose-900" : "border-stone-800 bg-paper text-ink"
            }`}
          >
            {doc.notice.text}
          </div>
        )}

        <h1 className="mt-7 font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:mt-3.5 max-lg:hidden">{doc.title}</h1>
        <div className="mt-3 space-y-2.5">
          {doc.intro.map((p) => (
            <p key={p} className={text}>
              {p}
            </p>
          ))}
        </div>

        <div className="mt-[22px] grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:gap-7 max-lg:mt-3.5 max-lg:grid-cols-[minmax(0,1fr)]! max-lg:gap-3.5">
          <nav
            aria-label="On this page"
            className="rounded-[18px] border border-line bg-paper p-3.5 md:sticky md:top-24 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto max-lg:static! max-lg:max-h-none! max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card"
          >
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">On this page</div>
            {doc.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block py-[5px] text-[13px] font-medium text-stone-600 hover:text-amber-800 hover:no-underline">
                {s.title}
              </a>
            ))}
          </nav>

          <div className="min-w-0">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className={card}>
                <h2 className="mb-2 text-lg font-bold text-ink max-lg:mb-1.5 max-lg:text-[16px]">{s.title}</h2>
                {s.blocks.map((b, i) => (
                  <BlockView key={i} b={b} />
                ))}
              </section>
            ))}
            <nav aria-label="Related pages" className="flex flex-wrap gap-2 pt-1">
              {related.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:no-underline">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
