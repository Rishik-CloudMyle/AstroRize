import { Suspense } from "react";
import AccountBlockBanner from "./account-block-banner";
import AppProvider from "./app-provider";
import LiveNotifier from "./live-notifier";
import LoginFromQuery from "./login-from-query";
import SiteFooter from "./site-footer";
import SiteHeader from "./site-header";
import { SiteAppHeader, SiteTabBar, SiteTabBarWithQuery } from "./mobile/site-app-shell";

/**
 * The public website's header, footer, modals and consult journey around a page.
 * ≥ 1024px: the desktop header and footer. < 1024px: the mobile app look — app header on top,
 * bottom tab bar (each side hides itself at the other widths).
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppProvider>
        <SiteHeader />
        <SiteAppHeader />
        <AccountBlockBanner />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Suspense fallback={<SiteTabBar search={null} />}>
          <SiteTabBarWithQuery />
        </Suspense>
        <LiveNotifier />
        {/* Opens the sign-in window when a portal sent the visitor here (?login=portal|admin). */}
        <Suspense fallback={null}>
          <LoginFromQuery />
        </Suspense>
      </AppProvider>
    </div>
  );
}
