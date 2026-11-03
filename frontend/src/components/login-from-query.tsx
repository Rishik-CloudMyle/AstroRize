"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAppUI } from "./app-provider";

const NOTICES: Record<string, string> = {
  portal: "Log in with your astrologer account email to open the astrologer portal.",
  admin: "Log in with your AstroRize staff email to open the admin console.",
};

/**
 * src/proxy.ts sends people who open /portal or /admin without the right account to
 * /?login=portal|admin. This opens the email sign-in with a short explanation.
 */
export default function LoginFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openLogin } = useAppUI();
  const area = params.get("login");

  useEffect(() => {
    if (!area) return;
    openLogin({ method: "email", notice: NOTICES[area] });
    // Drop ?login= so a refresh doesn't reopen the window.
    router.replace(pathname, { scroll: false });
  }, [area, openLogin, router, pathname]);

  return null;
}
