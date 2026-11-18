import AccessDenied from "@/components/admin/access-denied";
import FreeCallsConfigCard from "@/components/admin/config/free-calls-config-card";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Config · Free Calls" };

export default async function FreeCallsConfigPage() {
  if (!(await allowed("config"))) return <AccessDenied />;
  return <FreeCallsConfigCard />;
}
