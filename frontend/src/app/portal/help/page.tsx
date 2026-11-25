import type { Metadata } from "next";
import HelpView from "@/components/portal/views/help-view";

export const metadata: Metadata = { title: "Help" };

export default function PortalHelpPage() {
  return <HelpView />;
}
