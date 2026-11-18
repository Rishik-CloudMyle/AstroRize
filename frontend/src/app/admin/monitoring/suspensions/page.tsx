import AccessDenied from "@/components/admin/access-denied";
import Suspensions from "@/components/admin/monitoring/suspensions";
import { allowed } from "@/lib/admin/guard";
import { getSuspensions } from "@/lib/admin/api";

export const metadata = { title: "Suspensions" };

export default async function SuspensionsPage() {
  if (!(await allowed("compliance"))) return <AccessDenied />;
  return <Suspensions data={await getSuspensions()} />;
}
