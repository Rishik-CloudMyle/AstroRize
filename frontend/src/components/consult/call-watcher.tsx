"use client";

import { useEffect, useRef } from "react";
import { useConsultationState } from "@/lib/consultation-store";
import { getCallSession, releaseCallSession } from "@/lib/media/call-session";
import { playChime, unlockOnFirstGesture } from "@/lib/media/ring";
import { useAppUI } from "../app-provider";

// The customer's open consultation, followed on every page of the site (the consultation store
// polls it): when the astrologer picks up, a short chime (and, if the call is minimised, a note);
// when the consultation is over, its call is let go (room left, microphone/camera off) even if
// its window wasn't open.

export default function CustomerCallWatcher() {
  const { checked, open } = useConsultationState();
  const { toast } = useAppUI();
  const last = useRef<{ id: string; astrologerJoined: boolean; status: string } | null>(null);

  useEffect(() => {
    unlockOnFirstGesture();
  }, []);

  useEffect(() => {
    if (!checked) return;
    const prev = last.current;
    if (prev && prev.id !== open?.id) releaseCallSession(`/consultations/${prev.id}`);
    // An Instant Call request accepted while the customer browsed (minimised): they still have to join.
    if (open && prev?.id === open.id && prev.status === "requested" && open.status === "active") {
      playChime();
      if (!getCallSession(`/consultations/${open.id}`)?.windowCount) toast(`${open.astrologer.name} accepted your Instant Call — open your consultation from the top of the page to join.`);
    } else if (open && prev?.id === open.id && !prev.astrologerJoined && open.astrologerJoined && open.status === "active") {
      playChime();
      // Minimised: the call is still running — say who picked up and how to get back.
      const session = getCallSession(`/consultations/${open.id}`);
      if (!session || session.windowCount === 0) {
        toast(`${open.astrologer.name} picked up — open your consultation from the top of the page to talk.`);
      }
    }
    last.current = open ? { id: open.id, astrologerJoined: open.astrologerJoined, status: open.status } : null;
  }, [checked, open, toast]);

  return null;
}
