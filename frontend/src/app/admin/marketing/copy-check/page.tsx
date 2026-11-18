import AccessDenied from "@/components/admin/access-denied";
import CopyCheck from "@/components/admin/marketing/copy-check";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Marketing · Copy check" };

export default async function CopyCheckPage() {
  if (!(await allowed("marketing"))) return <AccessDenied />;
  return (
    <div className="mt-4">
      <CopyCheck />
    </div>
  );
}
