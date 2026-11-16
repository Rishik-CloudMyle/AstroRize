"use client";

// Wraps the recording player and the chat transcript with screen-capture DETERRENTS (client request,
// 16 Nov 2026: "playback only, screenshots and screen recording blocked").
//
// ⚠ A website cannot block screenshots or screen recorders: the operating system takes them and the
// page is never told. Only a native Android shell using FLAG_SECURE can really block them (iOS can
// only detect). So everything here is a deterrent and the page never claims otherwise:
//   1. a visible, moving watermark (name + last 4 digits of the mobile + time) over the content —
//      anything captured carries the viewer's identity;
//   2. the content blurs, and the player pauses, whenever the tab/window loses focus or is hidden
//      ("Paused for your privacy") — this also hides it from most screenshot tools and the app switcher;
//   3. printing is blocked (shortcut + @media print hides the content), Save/Print shortcuts, the context
//      menu, text selection, copying and dragging are disabled inside the content;
//   4. the PrintScreen key (and the usual OS screenshot shortcuts, when the browser sees them) blur the
//      content for a moment and overwrite the clipboard.
// A native wrapper plugs in through window.AstroRizeNative.secure (see secure-shell.ts).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSecureShell } from "./secure-shell";

const PrivacyContext = createContext({ hidden: false });
/** Whether the protected content is currently covered (the player pauses while it is). */
export const usePrivacyHidden = () => useContext(PrivacyContext).hidden;

const FLASH_MS = 3000;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function watermarkImage(line1: string, line2: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170" viewBox="0 0 300 170">` +
    `<g transform="rotate(-24 150 85)" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#1c1917" fill-opacity="0.16">` +
    `<text x="150" y="80">${esc(line1)}</text><text x="150" y="98" font-weight="400" font-size="11.5">${esc(line2)}</text></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function stamp(d: Date): string {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

export default function ProtectedContent({
  name,
  phone,
  noSelect = false,
  className = "",
  children,
}: {
  /** The viewer's name and mobile number, for the watermark. */
  name: string;
  phone: string;
  /** Also disable text selection (the transcript); the player has no text worth selecting anyway. */
  noSelect?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const secure = useSecureShell();
  const [away, setAway] = useState(false);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHide = useCallback(() => {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
  }, []);

  useEffect(() => {
    const check = () => setAway(document.visibilityState === "hidden" || !document.hasFocus());
    check();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "PrintScreen" || (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) || (e.ctrlKey && e.shiftKey && k === "s")) {
        flashHide();
        if (e.key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => {});
      } else if (mod && (k === "p" || k === "s")) {
        // Print / Save page.
        e.preventDefault();
        flashHide();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        flashHide();
        navigator.clipboard?.writeText("").catch(() => {});
      }
    };
    const beforePrint = () => setFlash(true);
    const afterPrint = () => setFlash(false);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pagehide", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      clearInterval(tick);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [flashHide]);

  const hidden = away || flash;
  const digits = phone.replace(/\D/g, "");
  const who = `${name.trim().slice(0, 26) || "AstroRize customer"}${digits.length >= 4 ? ` · ••${digits.slice(-4)}` : ""}`;
  const image = useMemo(() => watermarkImage(who, stamp(now)), [who, now]);
  const block = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <PrivacyContext.Provider value={{ hidden }}>
      <style>{`
        @keyframes azWatermarkDrift { from { background-position: 0 0; } to { background-position: 300px 170px; } }
        @media (prefers-reduced-motion: reduce) { .az-watermark { animation: none !important; } }
        .az-print-note { display: none; }
        @media print { [data-protected] { display: none !important; } .az-print-note { display: block; padding: 24px; font: 16px Arial, sans-serif; } }
      `}</style>
      <p className="az-print-note">This recording and transcript can&apos;t be printed.</p>
      <div
        data-protected
        onContextMenu={block}
        onCopy={block}
        onCut={block}
        onDragStart={block}
        className={`relative isolate overflow-hidden ${noSelect ? "select-none" : ""} [-webkit-touch-callout:none] ${className}`}
      >
        <div inert={hidden || undefined} aria-hidden={hidden || undefined} className={`transition-[filter] duration-150 ${hidden ? "pointer-events-none blur-2xl brightness-95" : ""}`}>
          {children}
        </div>
        <div
          aria-hidden="true"
          className="az-watermark pointer-events-none absolute inset-0 z-10 animate-[azWatermarkDrift_48s_linear_infinite]"
          style={{ backgroundImage: image, backgroundSize: "300px 170px" }}
        />
        {hidden && (
          <div role="status" className="absolute inset-0 z-20 grid place-items-center bg-app-bg/55 p-6 text-center">
            <div>
              <b className="block text-[15px] text-app-ink">Paused for your privacy</b>
              <span className="mt-1 block text-[12.5px] text-app-ink-2">Return to this window to continue.</span>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2.5 mb-0 text-[11.5px] leading-[1.5] text-app-ink-3">
        <b className="font-semibold text-app-ink-2">Playback only — this session can&apos;t be downloaded or shared.</b>{" "}
        {secure
          ? "Screenshots and screen recording are blocked by this app."
          : "A watermark with your details is shown, and the content hides when you leave this window. Your device can still capture its own screen."}
      </p>
    </PrivacyContext.Provider>
  );
}
