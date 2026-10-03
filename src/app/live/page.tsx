import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import LiveRoomView from "@/components/live/live-room-view";
import { getAstrologers } from "@/lib/mock/astrologers";
import { getLiveRoom } from "@/lib/mock/live";

export const metadata: Metadata = {
  title: "Live",
  description: "Watch astrologers live, ask questions in the room chat and join the consult queue at the room's rate.",
};

export default async function LivePage(props: PageProps<"/live">) {
  const { room: roomParam } = await props.searchParams;
  const [room, astrologers] = await Promise.all([
    getLiveRoom(typeof roomParam === "string" ? roomParam : undefined),
    getAstrologers(),
  ]);
  const host = astrologers.find((a) => a.id === room.astrologerId) ?? astrologers[0];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Live" }]} />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">Live on web</h1>
      <p className="mt-1.5 text-sm text-stone-600">
        Watch astrologers answer questions live, chat with the room, and join the consult queue for a one-to-one.
      </p>

      {/* key: reset chat, votes and reactions when switching rooms */}
      <LiveRoomView key={room.id} room={room} host={host} />
    </div>
  );
}
