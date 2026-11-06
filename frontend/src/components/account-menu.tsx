"use client";

// The signed-in customer's account menu in the desktop header: the initials circle opens a small
// menu with Wallet & account, Help & support, Messages and Log out.

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { sessionActions } from "@/lib/session-store";

const ITEMS = [
  { href: "/wallet", label: "Wallet & account" },
  { href: "/support", label: "Help & support" },
  { href: "/messages", label: "Messages" },
  { href: "/me", label: "Profile" },
];

export default function AccountMenu({ initials, name }: { initials: string; name: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative hidden min-[400px]:block">
      <button
        ref={button}
        type="button"
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="grid size-[38px] place-items-center rounded-full border-2 border-gold bg-linear-160 from-amber-100 to-amber-300 text-[13px] font-extrabold text-amber-900"
      >
        {initials}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Your account"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[220px] rounded-2xl border border-line bg-paper p-1.5 shadow-[0_12px_28px_rgba(90,62,40,.14)]"
        >
          <div className="truncate px-3 pt-1.5 pb-2 text-[12px] font-semibold text-stone-500">{name}</div>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-[13.5px] font-semibold text-ink hover:bg-amber-50 hover:text-amber-800 hover:no-underline"
            >
              {i.label}
            </Link>
          ))}
          <div role="separator" className="mx-2 my-1 border-t border-line-soft" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void sessionActions.logOut();
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-stone-600 hover:bg-amber-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
