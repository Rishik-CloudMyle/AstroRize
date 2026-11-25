"use client";

import { useAdmin } from "./admin-provider";

/** Shows its children to the Super Admin only; other departments get these pages in the left menu instead. */
export default function SuperOnly({ children }: { children: React.ReactNode }) {
  return useAdmin().session.role === "super" ? <>{children}</> : null;
}
