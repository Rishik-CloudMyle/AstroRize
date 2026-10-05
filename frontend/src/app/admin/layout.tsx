import type { Metadata } from "next";
import AdminProvider from "@/components/admin/admin-provider";
import Sidebar from "@/components/admin/sidebar";
import { navForSession } from "@/lib/admin/access";
import { getSession } from "@/lib/admin/api";
import { getEnvironment, NAV, ROLE_LABELS } from "@/lib/admin/constants";

export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · Admin · Astrorize" },
  description: "Astrorize admin console.",
  robots: { index: false, follow: false },
};

// Admin console (/admin/**). src/proxy.ts only lets signed-in admins in; the admin's
// role (from their sign-in email) decides which pages they can open.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getSession();

  return (
    // Desktop-only console: below 1280px the page scrolls sideways instead of reflowing.
    <div className="az-app az-admin min-w-[1280px]">
      <AdminProvider session={session}>
        <div className="flex min-h-screen flex-col bg-cream">
          <div className="grid flex-1 grid-cols-[250px_minmax(0,1fr)] items-stretch">
            <Sidebar
              session={session}
              roleLabel={ROLE_LABELS[session.role]}
              environment={getEnvironment()}
              nav={navForSession(NAV, session)}
            />
            <main className="min-w-0 px-[26px] pt-[22px] pb-14">{children}</main>
          </div>
        </div>
      </AdminProvider>
    </div>
  );
}
