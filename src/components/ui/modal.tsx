"use client";

import { useEffect, useRef } from "react";

/**
 * Centered dialog over a dimmed backdrop (the prototype's modal style).
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
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[rgba(28,25,23,.45)] p-4 sm:p-6"
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
        className="relative w-full rounded-[20px] bg-paper p-5 shadow-[0_16px_40px_rgba(11,31,51,.18)] outline-none sm:p-[26px]"
      >
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
