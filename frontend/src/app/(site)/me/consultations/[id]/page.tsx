import type { Metadata } from "next";
import SessionDetailView from "@/components/sessions/session-detail";

export const metadata: Metadata = {
  title: "Consultation",
  robots: { index: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function MyConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetailView id={id} />;
}
