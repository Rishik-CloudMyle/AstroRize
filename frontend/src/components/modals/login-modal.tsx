"use client";

import { useRouter } from "next/navigation";
import { homeFor } from "@/lib/auth";
import LoginForm, { type LoginMethod } from "../account/login-form";
import Modal, { CloseButton } from "../ui/modal";

export type { LoginMethod };

export interface LoginOptions {
  method?: LoginMethod;
  /** Shown above the form, e.g. when a portal sent the visitor here to sign in. */
  notice?: string;
  /** Runs once a customer has signed in (e.g. carry on to the consultation they asked for). */
  then?: () => void;
}

/**
 * Sign-in window, opened mid-flow (consult, wallet, portals) so the visitor stays on the page.
 * Astrologers open /portal and admins /admin; customers stay where they were.
 * The full-page versions are /login and /signup.
 */
export default function LoginModal({ onClose, options = {} }: { onClose: () => void; options?: LoginOptions }) {
  const router = useRouter();
  return (
    <Modal onClose={onClose} labelledBy="login-title">
      <LoginForm
        headingId="login-title"
        initialMethod={options.method}
        notice={options.notice}
        closeButton={<CloseButton onClick={onClose} />}
        onSignedIn={(user) => {
          onClose();
          if (user.role !== "customer") router.push(homeFor(user.role));
          else options.then?.();
        }}
        onGuest={onClose}
        onLeave={onClose}
      />
    </Modal>
  );
}
