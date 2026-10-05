import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import LiveRoomView from "@/components/live/live-room-view";
import { getAstrologers, getLiveRooms } from "../data";

export const metadata: Metadata = {
  title: "Live",
  description: "Watch astrologers live, ask questions in the room chat and join the consult queue at the room's rate.",
};

/** The room /live opens when no room is chosen (falls back to the first live room). */
const DEFAULT_ROOM = "raghav";

export default async function LivePage(props: PageProps<"/live">) {
  const { room: roomParam } = await props.searchParams;
  const [rooms, { astrologers }] = await Promise.all([getLiveRooms(), getAstrologers()]);
  const wanted = typeof roomParam === "string" ? roomParam : DEFAULT_ROOM;
  const room = rooms.find((r) => r.id === wanted) ?? rooms.find((r) => r.id === DEFAULT_ROOM) ?? rooms[0];
  const host = room && astrologers.find((a) => a.id === room.astrologerId);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Live" }]} />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">Live on web</h1>
      <p className="mt-1.5 text-sm text-stone-600">
        Watch astrologers answer questions live, chat with the room, and join the consult queue for a one-to-one.
      </p>

      {room && host ? (
        // key: reset chat, votes and reactions when switching rooms
        <LiveRoomView key={room.id} room={room} host={host} />
      ) : (
        <div className="mx-auto mt-8 max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
          <h2 className="font-display text-[28px] font-semibold text-ink">No one is live right now</h2>
          <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-normal text-stone-600">
            Live rooms open through the day. Meanwhile, you can consult an astrologer one-to-one.
          </p>
          <Link
            href="/astrologers"
            className="az-cta mt-6 inline-flex h-12 items-center rounded-full px-8 text-[15px] font-bold hover:text-cta-ink hover:no-underline"
          >
            Browse astrologers
          </Link>
        </div>
      )}
    </div>
  );
}
