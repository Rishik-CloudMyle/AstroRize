import AccessDenied from "@/components/admin/access-denied";
import GiftEditor from "@/components/admin/marketing/gift-editor";
import { PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getMarketing } from "@/lib/admin/api";

export const metadata = { title: "Marketing · Gift catalogue" };

export default async function GiftsPage() {
  if (!(await allowed("marketing"))) return <AccessDenied />;
  const data = await getMarketing();
  return (
    <div className="mt-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Gift catalogue</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            The gifts customers can send in lives and on profiles. Marketing adds a draft; an Admin makes it live. A gift priced at the {data.giftCap} cap shows AT CAP.
          </p>
          <GiftEditor gifts={data.gifts} giftCap={data.giftCap} />
        </div>

    </div>
  );
}
