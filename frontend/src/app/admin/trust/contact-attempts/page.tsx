import AccessDenied from "@/components/admin/access-denied";
import ContactFlags from "@/components/admin/trust/contact-flags";
import { PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getContactFlags } from "@/lib/admin/api";
import type { ContactFlagShow } from "@/lib/admin/types";

export const metadata = { title: "Trust · Contact attempts" };

export default async function ContactAttemptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await allowed("trust"))) return <AccessDenied />;
  const sp = await searchParams;
  const show: ContactFlagShow = sp.flags === "reviewed" || sp.flags === "all" ? sp.flags : "open";
  const flags = await getContactFlags(show);
  return (
      <div className={`${PANEL} relative mt-4 p-5`}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Off-platform contact attempts</h2>
        <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
          Messages that were stopped because they shared a phone number, email, link, social or payment app, UPI ID or
          home address — in free chat, a paid consultation&rsquo;s chat or live chat. The detail itself is never shown.
        </p>
        <ContactFlags data={flags} />
      </div>

  );
}
