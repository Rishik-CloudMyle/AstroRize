import AccessDenied from "@/components/admin/access-denied";
import ModerationQueue from "@/components/admin/trust/moderation-queue";
import { PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getTrust } from "@/lib/admin/api";

export const metadata = { title: "Trust · Reviews" };

export default async function TrustReviewsPage() {
  if (!(await allowed("trust"))) return <AccessDenied />;
  const data = await getTrust();
  return (
      <div className={`${PANEL} relative mt-4 p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Moderation queue</h2>
        <ModerationQueue data={data} />
      </div>

  );
}
