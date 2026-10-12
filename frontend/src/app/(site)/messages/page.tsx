import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import MessengerView from "@/components/messages/messenger-view";

export const metadata: Metadata = {
  title: "Messages",
  description: "Free direct messages with astrologers on Astrorize.",
  robots: { index: false },
};

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Messages" }]} />
      <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px]">Messages</h1>
      <p className="mb-6 text-sm text-stone-600">
        Astrologer Messenger — free, text-only messages with any astrologer on Astrorize. Astrologers reply personally.
      </p>
      <MessengerView />
    </div>
  );
}
