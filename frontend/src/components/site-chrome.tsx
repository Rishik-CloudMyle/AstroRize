import { Suspense } from "react";
import AppProvider from "./app-provider";
import LiveNotifier from "./live-notifier";
import LoginFromQuery from "./login-from-query";
import SiteFooter from "./site-footer";
import SiteHeader from "./site-header";

/** The public website's header, footer, modals and consult journey around a page. */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppProvider>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <LiveNotifier />
        {/* Opens the sign-in window when a portal sent the visitor here (?login=portal|admin). */}
        <Suspense fallback={null}>
          <LoginFromQuery />
        </Suspense>
      </AppProvider>
    </div>
  );
}
