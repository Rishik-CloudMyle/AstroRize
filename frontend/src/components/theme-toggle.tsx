"use client";

import { useSyncExternalStore } from "react";

// The theme switch: light (cream) or dark (dark brown). The choice is kept on this device;
// app/layout.tsx applies it before the page is drawn.

export const THEME_KEY = "astrorize.theme";
const CHANGED = "astrorize:theme";

const isDark = () => document.documentElement.dataset.theme === "dark";
function apply(dark: boolean) {
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1612" : "#f7f4ee");
}
function subscribe(onChange: () => void) {
  // Another tab changed the theme.
  const fromStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(e.newValue === "dark");
    onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", fromStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", fromStorage);
  };
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = !isDark();
    apply(next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Storage blocked: the choice lasts until the page is reloaded.
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return { dark, toggle };
}

const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[18px]">
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
  </svg>
);
const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-[18px]">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </svg>
);

/**
 * `icon`: a round moon/sun button (headers). `row`: "Dark mode  On/Off" (settings, menus).
 */
export default function ThemeToggle({ variant = "icon", className = "" }: { variant?: "icon" | "row"; className?: string }) {
  const { dark, toggle } = useTheme();
  if (variant === "row") {
    return (
      <button type="button" role="switch" aria-checked={dark} onClick={toggle} className={`flex w-full items-center justify-between gap-3 text-left text-[14px] font-semibold ${className}`}>
        <span className="inline-flex items-center gap-2">
          {dark ? <Sun /> : <Moon />}
          Dark mode
        </span>
        <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${dark ? "bg-amber-500" : "bg-stone-300"}`}>
          <span className={`absolute size-5 rounded-full bg-[#ffffff] shadow transition-[left] ${dark ? "left-[22px]" : "left-0.5"}`} />
          <span className="sr-only">{dark ? "On" : "Off"}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"} className={`grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-white text-stone-700 ${className}`}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
