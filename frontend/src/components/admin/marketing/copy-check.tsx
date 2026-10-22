"use client";

import { useId, useState } from "react";
import { PANEL } from "@/components/admin/ui";

// Trust content check: Marketing pastes campaign or banner copy and sees any absolute-outcome
// claim before it goes anywhere (astrology can't promise results). The same kind of wording the
// astrologer portal refuses in a bio. A writing aid only: nothing is saved or sent.

const CLAIMS: RegExp[] = [
  /\bguarantee(?:d|s)?\b/gi,
  /\b100\s?%/gi,
  /\bdefinitely\b/gi,
  /\bcures?\b/gi,
  /\bcertainly\b/gi,
  /\bmiracle(?:s)?\b/gi,
  /\bassured\b/gi,
  /\bsolve(?:s)? (?:any|all|every)(?: of your)? problems?\b/gi,
  /\bnever fails?\b/gi,
];

/** The flagged ranges in `text`, in order and never overlapping. */
function findClaims(text: string): [number, number][] {
  const hits: [number, number][] = [];
  for (const re of CLAIMS) for (const m of text.matchAll(re)) hits.push([m.index, m.index + m[0].length]);
  hits.sort((a, b) => a[0] - b[0]);
  return hits.filter((h, i) => i === 0 || h[0] >= hits[i - 1][1]);
}

export default function CopyCheck() {
  const id = useId();
  const [text, setText] = useState("");
  const hits = findClaims(text);
  const parts: React.ReactNode[] = [];
  let at = 0;
  hits.forEach(([from, to], i) => {
    parts.push(text.slice(at, from));
    parts.push(
      <b key={i} className="rounded-[4px] bg-rose-50 px-1 py-px text-rose-700">
        {text.slice(from, to)}
      </b>,
    );
    at = to;
  });
  parts.push(text.slice(at));

  return (
    <div className={`${PANEL} p-5`}>
      <h2 className="mt-0 mb-1 text-[16px] font-bold">Trust content check</h2>
      <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
        Paste campaign or banner copy to catch absolute-outcome claims (“guaranteed”, “100%”, “solve any problem”) before you
        use it. Nothing is saved.
      </p>
      <label htmlFor={id} className="sr-only">
        Copy to check
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={2000}
        rows={4}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Talk to a trusted astrologer about your career this Navratri."
        className="w-full rounded-xl border border-line bg-white px-[15px] py-[11px] text-[13.5px] leading-[1.55] text-ink outline-none focus:border-amber-500"
      />
      {text.trim() !== "" && (
        <div aria-live="polite">
          {hits.length > 0 && (
            <div className="mt-2 rounded-xl border border-line bg-white px-[15px] py-[11px] text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap text-[#57534e]">
              {parts}
            </div>
          )}
          <div
            className={`mt-3 flex items-start gap-[9px] rounded-xl border px-[13px] py-[11px] text-[12px] leading-[1.45] ${
              hits.length ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className={hits.length ? "text-rose-700" : "text-emerald-700"}>{hits.length ? "✕" : "✓"}</span>
            <span>
              {hits.length ? (
                <>
                  <b>
                    {hits.length} claim {hits.length === 1 ? "violation" : "violations"}.
                  </b>{" "}
                  Outcome promises breach the trust-copy rule. Rewrite the highlighted words before using this copy.
                </>
              ) : (
                "No outcome claims found."
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
