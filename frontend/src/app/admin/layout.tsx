import type { Metadata } from "next";
import AdminProvider from "@/components/admin/admin-provider";
import Sidebar, { AdminTopBar } from "@/components/admin/sidebar";
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
  const rail = {
    session,
    roleLabel: ROLE_LABELS[session.role],
    environment: getEnvironment(),
    nav: navForSession(NAV, session),
  };

  return (
    // The page only ever scrolls vertically. From 1024px the dark rail is pinned on the left;
    // below that it folds into a top bar with a menu button. Wide tables scroll inside their card.
    <div className="az-app az-admin">
      <AdminProvider session={session}>
        <div className="flex min-h-screen flex-col bg-cream">
          <AdminTopBar {...rail} />
          <div className="flex-1 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-stretch">
            <Sidebar {...rail} />
            <main className="min-w-0 px-4 pt-5 pb-14 lg:px-[26px] lg:pt-[22px]">{children}</main>
          </div>
        </div>
      </AdminProvider>
    </div>
  );
}
