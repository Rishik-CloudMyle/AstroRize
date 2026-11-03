import type { Metadata } from "next";
import AuthShell from "@/components/account/auth-shell";
import LoginPageView from "./login-page-view";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to AstroRize with your mobile number or email to consult astrologers, recharge your wallet and more.",
  robots: { index: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, method } = await props.searchParams;
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Your astrologers, your wallet, one account."
      points={[
        "Customers log in with a one-time code — no password needed.",
        "Astrologers and AstroRize staff log in with their email.",
        "The same account works in the AstroRize app.",
      ]}
    >
      <LoginPageView next={typeof next === "string" ? next : null} initialMethod={method === "email" ? "email" : "phone"} />
    </AuthShell>
  );
}
