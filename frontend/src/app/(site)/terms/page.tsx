import type { Metadata } from "next";
import LegalPage from "@/components/legal/legal-page";
import { TERMS } from "@/lib/legal/terms";

export const metadata: Metadata = { title: "Terms & Conditions", description: TERMS.description };

export default function TermsPage() {
  return (
    <LegalPage
      doc={TERMS}
      related={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/data-deletion-policy", label: "Data Deletion Policy" },
        { href: "/delete-account", label: "Delete your account" },
      ]}
    />
  );
}
