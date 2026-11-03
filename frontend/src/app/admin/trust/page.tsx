import AccessDenied from "@/components/admin/access-denied";
import ContactFlags from "@/components/admin/trust/contact-flags";
import ModerationQueue from "@/components/admin/trust/moderation-queue";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getContactFlags, getTrust } from "@/lib/admin/api";
import type { ContactFlagShow } from "@/lib/admin/types";

export const metadata = { title: "Trust & reviews" };

export default async function TrustPage({ searchParams }: PageProps<"/admin/trust">) {
  if (!(await allowed("trust"))) return <AccessDenied />;
  const sp = await searchParams;
  const show: ContactFlagShow = sp.flags === "reviewed" || sp.flags === "all" ? sp.flags : "open";
  const [data, flags] = await Promise.all([getTrust(), getContactFlags(show)]);
  const { density, sampleFloor } = data;
  const pct = Math.min(100, (density.value / density.target) * 100);
  const gatePassed = density.value >= density.target;
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <div>
      <PageTitle
        title="Trust & reviews"
        sub="Flagged reviews to keep or remove with a reason, off-platform contact attempts, and the rating sample floor."
      />

      <div className={`${PANEL} relative mt-[18px] p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Moderation queue</h2>
        <ModerationQueue data={data} />
      </div>

      <div id="contact-attempts" className={`${PANEL} relative mt-4 p-5`}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Off-platform contact attempts</h2>
        <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
          Messages that were stopped because they shared a phone number, email, link, social or payment app, UPI ID or
          home address — in free chat, a paid consultation&rsquo;s chat or live chat. The detail itself is never shown.
        </p>
        <ContactFlags data={flags} />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Recommendation engine</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Can be switched on once there is enough consultation data to pass the density gate: completed
            consultations on the platform against the target set in Config.
          </p>
          <div className="flex items-center gap-[11px]">
            <span className="h-3 flex-1 overflow-hidden rounded-[5px] bg-[#eee7db]">
              <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[13px] font-bold tabular-nums">
              {n(density.value)} / {n(density.target)}
            </span>
          </div>
          <div className="mt-3 inline-flex min-h-9 items-center rounded-[11px] border border-dashed border-stone-300 bg-stone-100 px-[15px] py-1.5 text-[13px] font-bold text-muted">
            {gatePassed ? "Density gate passed — the recommendation engine isn’t available yet" : "Activate — blocked by density gate"}
          </div>
        </div>

        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Sample-floor governance</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Astrologers customers can see who have fewer completed consultations than the platform floor (set in Config).
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-[11px] font-bold text-[#78716c]">Platform floor</div>
              <b className="text-[19px] tabular-nums">
                {n(sampleFloor.floor)} {sampleFloor.floor === 1 ? "consult" : "consults"}
              </b>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#78716c]">Below floor</div>
              <b className="text-[19px] text-amber-700 tabular-nums">
                {n(sampleFloor.below)} of {n(sampleFloor.total)} {sampleFloor.total === 1 ? "astrologer" : "astrologers"}
              </b>
            </div>
          </div>
          <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-[1.5] text-amber-900">
            The floor isn&rsquo;t applied on the website yet: every astrologer&rsquo;s rating is shown, whatever their
            number of consultations.
          </div>
        </div>
      </div>
    </div>
  );
}
