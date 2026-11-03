import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import MessengerView from "@/components/messages/messenger-view";
import { AppPageTitle } from "@/components/mobile/page-title";

export const metadata: Metadata = {
  title: "Messages",
  description: "Free direct messages with astrologers on AstroRize.",
  robots: { index: false },
};

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:pb-6 max-lg:pt-2 max-lg:sm:px-4">
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Messages" }]} />
        <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px]">Messages</h1>
        <p className="mb-6 text-sm text-stone-600">
          Astrologer Messenger — free messages with any astrologer on AstroRize: text, photos and short videos. Astrologers reply personally.
        </p>
      </div>
      {/* Phone/tablet: the app's screen title and its one-line explanation. */}
      <div className="lg:hidden">
        <AppPageTitle>Messages</AppPageTitle>
        <p className="mt-2.5 mb-3 text-[12px] leading-[1.45] text-app-ink-2">
          Astrologer Messenger — free direct messages with astrologers: text, photos and short videos. Astrologers reply personally.
        </p>
      </div>
      <MessengerView />
    </div>
  );
}
