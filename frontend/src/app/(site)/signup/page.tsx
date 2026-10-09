import type { Metadata } from "next";
import AuthShell from "@/components/account/auth-shell";
import SignupView from "./signup-view";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your Astrorize account to consult verified astrologers, or apply to join Astrorize as an astrologer.",
};

export default async function SignupPage(props: PageProps<"/signup">) {
  const { as, next } = await props.searchParams;
  return (
    <AuthShell
      eyebrow="Join Astrorize"
      title="Guidance from verified astrologers, whenever you need it."
      points={[
        "Sign up with your mobile number — no password needed.",
        "Add your birth details once; use them in every consultation.",
        "Astrologers: apply here, then finish your application in the portal.",
      ]}
    >
      <SignupView initialRole={as === "astrologer" ? "astrologer" : "customer"} next={typeof next === "string" ? next : null} />
    </AuthShell>
  );
}
