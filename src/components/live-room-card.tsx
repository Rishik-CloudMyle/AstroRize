import Image from "next/image";
import Link from "next/link";
import type { Astrologer, LiveRoom } from "@/lib/types";
import { rupee } from "@/lib/format";

/** Live room thumbnail with the host, topic, viewer count and the room's promo rate. */
export default function LiveRoomCard({ room, host }: { room: LiveRoom; host: Astrologer }) {
  return (
    <Link href={`/live?room=${room.id}`} className="az-lift block min-w-0 text-left hover:no-underline">
      <span className="relative block h-[150px] overflow-hidden rounded-2xl bg-ink">
        <Image src={room.thumb} alt="" fill sizes="(max-width: 640px) 100vw, 300px" className="object-cover" />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.35)_0%,rgba(28,25,23,.05)_40%,rgba(28,25,23,.78)_100%)]" />
        <span className="absolute left-2.5 top-2.5 inline-flex h-[22px] items-center gap-[5px] rounded-full bg-urgent px-[9px] text-[10px] font-extrabold text-white">
          ● LIVE
        </span>
        <span className="absolute right-2.5 top-2.5 inline-flex h-[22px] items-center gap-1 rounded-full bg-black/45 px-[9px] text-[10px] font-bold text-white">
          👁 {room.viewers.toLocaleString("en-IN")}
        </span>
        <span className="absolute inset-x-3 bottom-3 flex items-center gap-2">
          <span className="relative size-[34px] shrink-0 overflow-hidden rounded-full border-2 border-gold">
            <Image src={host.photo} alt="" fill sizes="68px" className="object-cover" />
          </span>
          <span className="min-w-0">
            <b className="block truncate text-[13px] font-bold text-paper">{host.name}</b>
            <span className="block text-[11px] text-paper/70">{room.topic}</span>
          </span>
        </span>
      </span>
      <span className="mt-2 flex items-baseline gap-1.5">
        {host.was && host.was > host.price && (
          <span className="text-[11px] text-muted line-through">{rupee(host.was)}</span>
        )}
        <b className="text-sm text-ink">{rupee(host.price)}</b>
        <span className="text-[11px] text-stone-500">/min</span>
      </span>
    </Link>
  );
}
