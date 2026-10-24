import { bannerFor } from "@/lib/portal/status";
import type { AccountStatus } from "@/lib/portal/types";

/**
 * Account lifecycle / suspension banner at the top of every page.
 * Driven entirely by the account status from the API.
 */
export default function StatusBanner({ status }: { status: AccountStatus }) {
  const b = bannerFor(status);
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-2xl border px-[18px] py-3.5 max-lg:mb-3.5 max-lg:gap-2.5 max-lg:rounded-app-card max-lg:p-3"
      style={{ background: b.bg, borderColor: b.border }}
    >
      <span className="text-base leading-[1.3]" aria-hidden="true">
        {b.icon}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm max-lg:text-[13.333px]" style={{ color: b.fg }}>
          {b.title}
        </b>
        <span className="mt-0.5 block text-[13px] leading-[1.5] opacity-[.86] max-lg:text-[12px] max-lg:leading-[1.45]" style={{ color: b.fg }}>
          {b.body}
        </span>
      </div>
    </div>
  );
}
