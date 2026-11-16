import type { Metadata } from "next";
import SessionsList from "@/components/sessions/sessions-list";

export const metadata: Metadata = {
  title: "My consultations",
  description: "Your paid AstroRize consultations, with in-app playback of recordings and chat transcripts.",
  robots: { index: false },
};

// Never cached: the page lives behind login and shows private sessions.
export const dynamic = "force-dynamic";

export default function MyConsultationsPage() {
  return <SessionsList />;
}
