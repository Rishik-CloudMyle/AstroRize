"use client";

import { createPortal } from "react-dom";
import type { BookingDetail } from "@/lib/portal/types";
import { PersonProfileDialog } from "./live-queue-people";

/** A booked slot and the customer who booked it, opened from the dashboard schedule or the calendar. */
export default function BookingDialog({ slotId, onClose }: { slotId: string; onClose: () => void }) {
  // Rendered on <body> so no panel effect can trap the fixed overlay; centred on every screen size.
  return createPortal(
    <PersonProfileDialog
      key={slotId}
      url={`/portal/schedule/${encodeURIComponent(slotId)}`}
      read={(body) => {
        const person = (body as { person: BookingDetail }).person;
        const n = person.history.consultations;
        return {
          alias: person.alias,
          profile: person.profile,
          badges: [
            { label: person.slot.detail, tone: "amber" },
            { label: `${person.slot.date} · ${person.slot.start} – ${person.slot.end}`, tone: "plain" },
            { label: n === 0 ? "First consultation with you" : `${n} consultation${n === 1 ? "" : "s"} with you`, tone: "plain" },
          ],
        };
      }}
      note="Shared with you only because this customer booked a session with you. Use it to prepare; don't save or share it."
      onClose={onClose}
    />,
    document.body,
  );
}
