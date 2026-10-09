"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centred console dialog over a dimmed backdrop. Accessible: role="dialog" + aria-modal,
 * focus moves in and is trapped inside (Tab / Shift+Tab wrap), Escape or a backdrop click
 * closes it, and focus goes back to the element that opened it. The panel is never taller
 * than the window: the header stays put and the body scrolls inside.
 *
 * Rendered into <body> (a hovered .az-panel is transformed, which would offset a fixed child),
 * inside the console's .az-app/.az-admin wrapper classes so the console styles still apply.
 */
type DialogProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  width?: number;
  /** Optional row of actions pinned under the scrolling body. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

const noSubscribe = () => () => {};

export default function AdminDialog(props: DialogProps) {
  // Only in the browser: a dialog opened from the URL (e.g. ?app=) must not render on the server.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return inBrowser ? createPortal(<DialogPanel {...props} />, document.body) : null;
}

function DialogPanel({ title, subtitle, onClose, width = 760, footer, children }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // The latest onClose without re-running the effect (which would steal focus on every render).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    // Focus the panel itself (screen readers then read the title), not the first button.
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="az-app az-admin">
      <div
        className="fixed inset-0 z-[200] grid place-items-center bg-[rgba(28,25,23,.45)] p-6"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeRef.current();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ maxWidth: width }}
          className="flex max-h-[calc(100dvh-48px)] w-full flex-col overflow-hidden rounded-[20px] bg-paper shadow-[0_24px_60px_rgba(11,31,51,.28)] outline-none"
        >
          <div className="flex flex-none items-start gap-3 border-b border-line px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="m-0 text-[18px] font-bold text-ink">
                {title}
              </h2>
              {subtitle && <div className="mt-1 text-[12.5px] text-[#78716c]">{subtitle}</div>}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => closeRef.current()}
              className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border-0 bg-cream text-[15px] text-[#57534e]"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex-none border-t border-line bg-cream/60 px-6 py-3.5">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
