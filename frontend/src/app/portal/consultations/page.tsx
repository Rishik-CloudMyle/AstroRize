import type { Metadata } from "next";
import ConsultationsView from "@/components/portal/views/consultations-view";
import { getConsultations } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Consultations" };

export default async function ConsultationsPage() {
  const data = await getConsultations();
  return <ConsultationsView data={data} />;
}
