"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** The browser's "this site can be installed" event (Chrome, Edge, Samsung Internet). */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The event fires once, often before this card is on screen: keep it from the start.
let saved: InstallPrompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as InstallPrompt;
  });
}

const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const subscribe = (onChange: () => void) => {
  window.addEventListener("appinstalled", onChange);
  return () => window.removeEventListener("appinstalled", onChange);
};

/**
 * "Download app" on phones: installs Astrorize to the home screen. Where the browser has no install
 * prompt (iPhone Safari, for one) it says how to add it. Hidden once running as the installed app.
 */
export default function InstallApp({ className = "" }: { className?: string }) {
  const isInstalled = useSyncExternalStore(subscribe, installed, () => true);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)));
  }, []);
  if (isInstalled) return null;

  async function download() {
    if (!saved) return setHelp(true);
    const prompt = saved;
    saved = null;
    await prompt.prompt();
    await prompt.userChoice;
  }

  return (
    <section aria-label="Get the app" className={`rounded-app-card border border-app-line-gold bg-app-surface p-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[14px] text-app-ink">Get the Astrorize app</b>
          <span className="block text-[11.5px] text-app-ink-2">Opens from your home screen, full screen.</span>
        </div>
        <button type="button" onClick={() => void download()} className="h-10 shrink-0 rounded-full bg-amber-500 px-4 text-[13px] font-bold text-ink">
          Download app
        </button>
      </div>
      {help && (
        <p role="status" className="mt-2.5 mb-0 text-[12px] leading-normal text-app-ink-2">
          {ios
            ? "On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen”."
            : "Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”."}
        </p>
      )}
    </section>
  );
}
