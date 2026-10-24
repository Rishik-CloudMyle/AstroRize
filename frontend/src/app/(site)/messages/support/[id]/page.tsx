import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import MessengerView from "@/components/messages/messenger-view";

export const metadata: Metadata = {
  title: "Astrorize support",
  robots: { index: false },
};

/** A conversation the Astrorize team started with the customer. */
export default async function SupportConversationPage(props: PageProps<"/messages/support/[id]">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 lg:pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Messages", href: "/messages" }]} />
      {/* On a phone/tablet the conversation is a full screen with its own title bar. */}
      <h1 className="mb-1 font-display text-[42px] font-semibold text-ink max-lg:hidden">Messages</h1>
      <p className="mb-6 text-sm text-stone-600 max-lg:hidden">
        Astrologer Messenger — free messages with any astrologer on Astrorize: text, photos and short videos. Astrologers reply personally.
      </p>
      <MessengerView supportId={id} />
    </div>
  );
}
