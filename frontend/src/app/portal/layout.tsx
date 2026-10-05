import type { Metadata } from "next";
import PortalProvider from "@/components/portal/portal-provider";
import PortalShell from "@/components/portal/portal-shell";
import { getAccount } from "@/lib/portal/data";

export const metadata: Metadata = {
  title: { default: "Astrologer portal", template: "%s · Astrologer portal · Astrorize" },
  description: "Astrorize astrologer portal: availability, consultations, live, earnings and profile.",
  robots: { index: false, follow: false },
};

// Astrologer portal (/portal/**). src/proxy.ts only lets signed-in astrologers in.
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const account = await getAccount();
  return (
    <div className="az-app az-portal">
      <PortalProvider account={account}>
        <PortalShell account={account}>{children}</PortalShell>
      </PortalProvider>
    </div>
  );
}
