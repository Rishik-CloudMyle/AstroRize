import AccessDenied from "@/components/admin/access-denied";
import FixedSessionsConfigCard from "@/components/admin/config/fixed-sessions-config-card";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Config · Fixed Sessions" };

export default async function FixedSessionsConfigPage() {
  if (!(await allowed("config"))) return <AccessDenied />;
  return <FixedSessionsConfigCard />;
}
