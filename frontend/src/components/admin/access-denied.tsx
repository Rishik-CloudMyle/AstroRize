import Link from "next/link";
import { PANEL } from "./ui";

/** Shown in place of a page the signed-in department can't open (the API answers 403). */
export default function AccessDenied() {
  return (
    <div>
      <h1 className="m-0 font-display text-[36px] font-semibold">Access denied</h1>
      <div className={`${PANEL} mt-5 max-w-[620px] p-[22px]`}>
        <b className="block text-[16px] text-ink">You don&apos;t have access to this page</b>
        <p className="mt-1.5 mb-0 text-[13px] leading-[1.55] text-[#57534e]">
          Your department can&apos;t open this page. If you need it for your work, ask a Super Admin to give your
          department access. Every change to access is recorded in the audit log.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-flex h-[38px] items-center rounded-[10px] border border-line bg-white px-[15px] text-[13px] font-bold text-ink hover:text-ink hover:no-underline"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
