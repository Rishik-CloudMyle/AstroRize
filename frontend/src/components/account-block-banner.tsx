"use client";

import { useSession } from "@/lib/session-store";

/**
 * Shown on every website page while the signed-in account is temporarily blocked for repeatedly
 * sharing contact details (lib/account-blocks.ts on the API): until when, why, and what still works.
 * The API refuses the blocked actions on its own; this tells the person before they try.
 */
export default function AccountBlockBanner() {
  const session = useSession();
  const block = session.loggedIn ? session.block : null;
  if (!block) return null;
  const astrologer = session.role === "astrologer";
  return (
    <div role="alert" className="border-b border-rose-200 bg-rose-50 max-lg:border-app-line">
      <div className="mx-auto flex max-w-[1240px] items-start gap-3 px-5 py-3 max-lg:px-4">
        <span aria-hidden="true" className="mt-px text-[16px] text-rose-700">
          ⛔
        </span>
        <p className="m-0 min-w-0 text-[13.5px] leading-[1.5] break-words text-rose-900">
          <b>Your account is blocked until {block.untilLabel}.</b> Reason: {block.reason}.{" "}
          {astrologer
            ? "Until then you can't take sessions, go live or send messages; your earnings stay readable in the portal."
            : "Until then you can't message, chat, call, join a live chat or queue, or send gifts. You can still see your wallet and history."}{" "}
          Sharing phone numbers, emails, links or other contact details isn&rsquo;t allowed on AstroRize.
        </p>
      </div>
    </div>
  );
}
