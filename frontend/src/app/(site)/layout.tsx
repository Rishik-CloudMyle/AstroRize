import SiteChrome from "@/components/site-chrome";

// Every public website page (home, astrologers, free tools, live, terms, wallet).
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
