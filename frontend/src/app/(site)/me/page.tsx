import type { Metadata } from "next";
import { ProfileHubPage } from "@/components/account/profile-hub";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your AstroRize account: wallet, messages, notifications, offers, free tools and legal information.",
  robots: { index: false },
};

// The Profile tab of the phone/tablet app look (also reachable on desktop).
export default function ProfilePage() {
  return <ProfileHubPage />;
}
