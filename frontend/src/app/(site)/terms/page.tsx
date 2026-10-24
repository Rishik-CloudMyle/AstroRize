import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import ToastButton from "@/components/toast-button";
import { HELPLINES, LEGAL_SECTIONS, LEGAL_TOC, TERMS_VERSION, TERMS_VERSION_HISTORY } from "@/lib/mock/legal";
import { COMPANY, GRIEVANCE_OFFICER } from "@/lib/mock/site";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Astrorize terms of service: scope, money and metering, discounts, fixed sessions, AI content and grievance redressal.",
};

export default function TermsPage() {
  return (
    // Phones and tablets: the app's reading screen — title bar, then cards edge to edge with a 16px gutter.
    <div className="mx-auto max-w-[1000px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <AppTopbar title="Terms & Conditions" className="lg:hidden" />
      <div className="max-lg:px-4 max-lg:pt-3">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Terms & Conditions" }]} className="mb-3.5 max-lg:hidden" />

      <div className="rounded-[18px] border-2 border-rose-700 bg-rose-50 px-[18px] py-[18px] sm:px-[22px] max-lg:rounded-app-card max-lg:border max-lg:border-app-error max-lg:bg-app-error-bg max-lg:p-3.5!">
        <div className="text-[11px] font-extrabold uppercase tracking-[.12em] text-rose-700">In crisis? Free, 24×7</div>
        <div className="mt-2 flex flex-wrap gap-x-7 gap-y-3">
          {HELPLINES.map((h) => (
            <div key={h.name}>
              <div className="text-[12.5px] font-semibold text-rose-900">{h.name}</div>
              <a
                href={`tel:${h.tel}`}
                className="text-2xl font-bold tabular-nums text-rose-700 hover:text-rose-800 hover:no-underline max-lg:text-[20px] max-lg:text-app-error"
              >
                {h.number}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[12.5px] leading-normal text-rose-900">
          Astrorize is guidance and entertainment. It is not medical, legal, financial or psychiatric advice.
        </p>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4 max-lg:mt-3.5">
        <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:hidden">Terms &amp; Conditions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-[26px] items-center rounded-full bg-amber-100 px-[11px] text-[11.5px] font-bold text-amber-800">
            {TERMS_VERSION.label}
          </span>
          <ToastButton
            message={TERMS_VERSION_HISTORY}
            className="h-8 rounded-full border border-line bg-white px-[13px] text-[12.5px] font-semibold"
          >
            Version history
          </ToastButton>
        </div>
      </div>

      <div className="mt-[22px] grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-7 max-lg:mt-3.5 max-lg:grid-cols-[minmax(0,1fr)]! max-lg:gap-3.5">
        <nav
          aria-label="On this page"
          className="rounded-[18px] border border-line bg-paper p-3.5 md:sticky md:top-24 max-lg:static! max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card"
        >
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">On this page</div>
          {LEGAL_TOC.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`block py-[5px] text-[13px] hover:no-underline ${l.highlight ? "font-bold text-amber-700" : "font-medium text-stone-600 hover:text-amber-800"}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0">
          {LEGAL_SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className={`mb-3.5 scroll-mt-24 rounded-[18px] border p-5 sm:p-[22px] max-lg:mb-2 max-lg:rounded-app-card max-lg:p-4! max-lg:shadow-app-card ${
                s.highlight ? "border-amber-300 bg-amber-50 max-lg:border-app-tint-3 max-lg:bg-app-tint" : "border-line bg-paper max-lg:border-app-line max-lg:bg-app-surface"
              }`}
            >
              <h2 className="mb-2 text-lg font-bold text-ink max-lg:mb-1.5 max-lg:text-[16px]">{s.title}</h2>
              <p className="text-pretty text-sm leading-[1.65] text-stone-600 max-lg:text-[13.5px] max-lg:text-app-ink-2">{s.body}</p>
            </section>
          ))}

          <section
            id="grievance"
            className="scroll-mt-24 rounded-[18px] border border-line-warm bg-card p-5 sm:p-[22px] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:p-4! max-lg:shadow-app-card"
          >
            <h2 className="mb-3 text-lg font-bold text-ink max-lg:text-[16px]">Grievance Officer</h2>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-stone-500">Name</dt>
                <dd className="mt-[3px] text-sm font-semibold">{GRIEVANCE_OFFICER.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-stone-500">Email</dt>
                <dd className="mt-[3px] text-sm font-semibold">
                  <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>{GRIEVANCE_OFFICER.email}</a>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-stone-500">Response timeline</dt>
                <dd className="mt-[3px] text-sm font-semibold">Acknowledged in 24 h · resolved in 15 days</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-stone-500">Address</dt>
                <dd className="mt-[3px] text-sm font-semibold leading-[1.45]">
                  {COMPANY.address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
