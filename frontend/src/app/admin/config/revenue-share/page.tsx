import AccessDenied from "@/components/admin/access-denied";
import RevenueShareView from "@/components/admin/config/revenue-share-view";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Config · Revenue share" };

export default async function RevenueSharePage() {
  if (!(await allowed("config"))) return <AccessDenied />;
  return <RevenueShareView />;
}
