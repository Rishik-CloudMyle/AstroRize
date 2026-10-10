"use client";

import Link from "next/link";
import { homeFor, type Role } from "@/lib/auth";
import { useOpenConsultation, type ConsultationView } from "@/lib/consultation-store";
import { useSession } from "@/lib/session-store";
import type { Astrologer } from "@/lib/types";

// Whether the visitor can start a consultation with an astrologer right now, and if not, why.
// Consult buttons are enabled only for "ok"; every other answer comes with a note saying why.

export type ConsultGate =
  | { kind: "ok" }
  /** Signed in as an astrologer or staff: consultations are for customer accounts. */
  | { kind: "staff"; role: Exclude<Role, "customer"> }
  /** The customer already has a consultation open (one at a time). */
  | { kind: "frozen"; open: ConsultationView }
  | { kind: "busy" }
  | { kind: "live" }
  | { kind: "off" };

export function useConsultGate(astrologer: Astrologer): ConsultGate {
  const session = useSession();
  const open = useOpenConsultation();
  if (session.loggedIn && session.role !== "customer") return { kind: "staff", role: session.role };
  if (open) return { kind: "frozen", open };
  if (astrologer.availability === "busy") return { kind: "busy" };
  if (astrologer.availability === "live") return { kind: "live" };
  if (astrologer.availability === "off") return { kind: "off" };
  return { kind: "ok" };
}

/** "an astrologer account" / "an Astrorize staff account" */
export function staffAccountName(role: Exclude<Role, "customer">): string {
  return role === "astrologer" ? "an astrologer account" : "an Astrorize staff account";
}

/** One-line reason, for toasts and button tooltips. */
export function staffConsultNote(role: Exclude<Role, "customer">): string {
  return `Consultations are for customer accounts — you're signed in as ${staffAccountName(role)}.`;
}

/** Short label for the main consult button while the astrologer can't take a consultation. */
export function blockedLabel(gate: ConsultGate): string | null {
  switch (gate.kind) {
    case "busy":
      return "In a consultation";
    case "live":
      return "Live now";
    case "off":
      return "Offline right now";
    default:
      return null;
  }
}

/** Tooltip for a disabled consult button (the frozen case has its own hint). */
export function blockedHint(gate: ConsultGate): string | undefined {
  switch (gate.kind) {
    case "staff":
      return staffConsultNote(gate.role);
    case "busy":
      return "In a consultation — try again soon";
    case "live":
      return "Live now — join the live room";
    case "off":
      return "Offline right now";
    default:
      return undefined;
  }
}

/** In a consult card: why the buttons are off (staff account, or the astrologer isn't available). */
export function ConsultBlockedNote({ gate, astrologer }: { gate: ConsultGate; astrologer: Astrologer }) {
  if (gate.kind === "staff") {
    return (
      <div role="status" className="rounded-2xl border border-line bg-cream px-3.5 py-3">
        <b className="block text-[13px] text-ink">Consultations are for customer accounts</b>
        <span className="mt-0.5 block text-[12px] leading-normal text-stone-600">
          You&apos;re signed in as {staffAccountName(gate.role)}.
        </span>
        <Link href={homeFor(gate.role)} className="mt-2 inline-block text-[12.5px] font-bold text-amber-700 underline">
          {gate.role === "astrologer" ? "Open the astrologer portal ›" : "Open the admin console ›"}
        </Link>
      </div>
    );
  }
  if (gate.kind === "live") {
    return (
      <div role="status" className="rounded-2xl border border-orange-200 bg-orange-50 px-3.5 py-3">
        <b className="block text-[13px] text-orange-800">{astrologer.name} is hosting a live room</b>
        <span className="mt-0.5 block text-[12px] leading-normal text-orange-900/80">
          One-to-one consultations open again after the live session. You can join the room and its consult queue now.
        </span>
        <Link
          href={`/live?room=${encodeURIComponent(astrologer.id)}`}
          className="mt-2.5 flex h-10 items-center justify-center gap-2 rounded-full bg-urgent px-4 text-[13.5px] font-bold text-white hover:text-white hover:no-underline"
        >
          <span className="size-2 rounded-full bg-white" aria-hidden="true" />
          Live now — join the live room ›
        </Link>
      </div>
    );
  }
  if (gate.kind === "busy" || gate.kind === "off") {
    const busy = gate.kind === "busy";
    return (
      <div role="status" className={`rounded-2xl border px-3.5 py-3 ${busy ? "border-rose-200 bg-rose-50" : "border-line bg-cream"}`}>
        <b className={`block text-[13px] ${busy ? "text-rose-800" : "text-ink"}`}>
          {busy ? "In a consultation — try again soon" : "Offline right now"}
        </b>
        <span className={`mt-0.5 block text-[12px] leading-normal ${busy ? "text-rose-900/80" : "text-stone-600"}`}>
          {busy
            ? `${astrologer.name} is with another customer. The buttons switch on by themselves when they're free.`
            : `${astrologer.name} isn't taking consultations at the moment. The buttons switch on by themselves when they come online.`}
        </span>
        <Link href="/astrologers?availability=Available" className="mt-2 inline-block text-[12.5px] font-bold text-amber-700 underline">
          See astrologers available now ›
        </Link>
      </div>
    );
  }
  return null;
}
