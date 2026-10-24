"use client";

import { useEffect, useRef } from "react";

/**
 * Centered dialog over a dimmed backdrop (the prototype's modal style). Below 1024px it is a bottom sheet instead, as in
 * the client's mobile app prototype (.sheet: full width, rounded top, grab handle, safe area).
 * Closes on Escape or a click on the backdrop, and locks page scrolling while open.
 */
export default function Modal({
  onClose,
  labelledBy,
  maxWidth = 400,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[rgba(28,25,23,.45)] p-4 sm:p-6 max-lg:place-items-end max-lg:overflow-hidden max-lg:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={{ maxWidth }}
        className="relative w-full rounded-[20px] bg-paper p-5 shadow-[0_16px_40px_rgba(11,31,51,.18)] outline-none sm:p-[26px] max-lg:max-h-[85dvh] max-lg:max-w-none! max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-b-none max-lg:rounded-t-app-modal max-lg:bg-app-elev max-lg:px-4! max-lg:pt-3! max-lg:pb-[calc(24px+var(--app-safe-bottom))]! max-lg:shadow-app-modal"
      >
        {/* Phones and tablets: a bottom sheet with the prototype's grab handle. */}
        <div aria-hidden="true" className="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-app-line lg:hidden" />
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-cream text-base leading-none text-stone-600"
    >
      ✕
    </button>
  );
}
