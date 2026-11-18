import type { Metadata } from "next";
import LegalPage from "@/components/legal/legal-page";
import { DELETION_POLICY } from "@/lib/legal/deletion-policy";

export const metadata: Metadata = { title: "Data Deletion Policy", description: DELETION_POLICY.description };

export default function DataDeletionPolicyPage() {
  return (
    <LegalPage
      doc={DELETION_POLICY}
      related={[
        { href: "/delete-account", label: "Delete your account" },
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms & Conditions" },
      ]}
    />
  );
}
