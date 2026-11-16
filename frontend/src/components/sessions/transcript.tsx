"use client";

// A paid chat's saved text, read-only: bubbles for both sides with their times (after the
// prototype's .bubble thread). Contact details were never delivered, so they aren't here either.

import { lineDay, lineTime, type TranscriptLine } from "./session-types";

export default function Transcript({ lines, astrologerName }: { lines: TranscriptLine[]; astrologerName: string }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-3 pb-4" aria-label={`Chat with ${astrologerName}`}>
      {lines.map((m, i) => {
        const d = lineDay(m.at);
        const heading = i === 0 || d !== lineDay(lines[i - 1]!.at) ? d : null;
        return (
          <li key={m.id} className="flex flex-col">
            {heading && <div className="my-1 self-center rounded-full bg-app-tint px-3 py-0.5 text-[11px] font-semibold text-app-ink-3">{heading}</div>}
            {m.from === "system" ? (
              <div className="self-center rounded-app-btn bg-app-bg px-3 py-1 text-center text-[12px] text-app-ink-3">{m.text}</div>
            ) : (
              <div className={`max-w-[85%] ${m.from === "me" ? "self-end" : "self-start"}`}>
                <div
                  className={`rounded-[16px] px-3 py-2 text-[14px] leading-[1.45] break-words whitespace-pre-wrap ${
                    m.from === "me" ? "rounded-br-[4px] bg-app-tint-2 text-app-ink" : "rounded-bl-[4px] border border-app-line bg-app-surface text-app-ink"
                  }`}
                >
                  {m.text}
                </div>
                <div className={`mt-0.5 text-[11px] text-app-ink-3 ${m.from === "me" ? "text-right" : ""}`}>
                  {m.from === "me" ? "You" : astrologerName} · {lineTime(m.at)}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
