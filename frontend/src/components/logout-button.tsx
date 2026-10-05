"use client";

import { useRouter } from "next/navigation";
import { sessionActions } from "@/lib/session-store";

/** Signs out (clears the session and its cookie) and returns to the public website. */
export default function LogoutButton({ className, children = "Log out" }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await sessionActions.logOut();
        router.push("/");
        router.refresh();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
