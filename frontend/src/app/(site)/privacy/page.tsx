import type { Metadata } from "next";
import LegalPage from "@/components/legal/legal-page";
import { PRIVACY } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: "Privacy Policy", description: PRIVACY.description };

export default function PrivacyPage() {
  return (
    <LegalPage
      doc={PRIVACY}
      related={[
        { href: "/terms", label: "Terms & Conditions" },
        { href: "/data-deletion-policy", label: "Data Deletion Policy" },
        { href: "/delete-account", label: "Delete your account" },
      ]}
    />
  );
}
