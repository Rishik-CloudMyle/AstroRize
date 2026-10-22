"use client";

import Link from "next/link";
import IntroVideo, { IntroVideoPlaceholder } from "../../astrologer/intro-video";
import { useAccount } from "../portal-provider";
import { Panel } from "../ui";

/** The intro video on the dashboard: what customers see on the public profile, managed on the Profile page. */
export default function IntroVideoCard({ url }: { url: string | null }) {
  const { astrologer: me } = useAccount();
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-bold">Intro video</h2>
        <Link href="/portal/profile" className="text-[12.5px] font-bold text-amber-700">
          {url ? "Manage ›" : "Add one ›"}
        </Link>
      </div>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-stone-500">
        {url ? "Customers see this on your public profile." : "Customers see “Intro video coming soon” on your profile until you add one."}
      </p>
      {url ? (
        <IntroVideo key={url} src={url} poster={me.photo} name={me.name} heightClass="h-[180px]" />
      ) : (
        <Link href="/portal/profile" aria-label="Add an intro video on your Profile page" className="block hover:no-underline">
          <IntroVideoPlaceholder poster={me.photo} note="Add a short video introducing yourself — it goes live as soon as it uploads." heightClass="h-[180px]" />
        </Link>
      )}
    </Panel>
  );
}
