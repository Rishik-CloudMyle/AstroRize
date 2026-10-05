import type { Metadata } from "next";
import ComplianceView from "@/components/portal/views/compliance-view";
import { getCompliance } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Compliance" };

export default async function CompliancePage() {
  const data = await getCompliance();
  return <ComplianceView data={data} />;
}
