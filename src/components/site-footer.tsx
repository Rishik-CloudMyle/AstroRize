import Image from "next/image";
import Link from "next/link";
import { COMPANY, FOOTER_COLUMNS, GRIEVANCE_OFFICER } from "@/lib/mock/site";

export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink text-[#d6cbb8]">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-8 px-4 pb-7 pt-11 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 min-w-0 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <Image src="/assets/brand/logo-mark.png" alt="" width={36} height={36} className="size-9 shrink-0 object-contain" />
            <span className="font-display text-[23px] font-semibold text-[#f8f4ec]">Astrorize</span>
          </div>
          <p className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-muted">
            {COMPANY.legalName}. {COMPANY.tagline}
          </p>
          <div className="mt-3.5 rounded-xl border border-stone-700 px-3.5 py-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-amber-300">Grievance Officer</div>
            <div className="mt-1 text-[12.5px] leading-normal text-[#d6cbb8]">
              {GRIEVANCE_OFFICER.name} ·{" "}
              <a href={`mailto:${GRIEVANCE_OFFICER.email}`} className="text-amber-300 hover:text-amber-200">
                {GRIEVANCE_OFFICER.email}
              </a>
              <br />
              {GRIEVANCE_OFFICER.timeline}
            </div>
          </div>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title} className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted">{col.title}</div>
            <ul className="mt-3 flex flex-col gap-[9px]">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="block text-[13px] font-medium text-[#d6cbb8] hover:text-amber-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-800">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-stone-500 sm:px-6">
          <span>
            © 2026 {COMPANY.legalName} · CIN {COMPANY.cin}
          </span>
          <span>{COMPANY.policyVersions}</span>
        </div>
      </div>
    </footer>
  );
}
