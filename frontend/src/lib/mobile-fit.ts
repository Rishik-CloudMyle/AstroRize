"use client";

import { useEffect, useRef } from "react";
import { lockScroll } from "@/lib/scroll-lock";

/**
 * Keeps a full-screen window (a chat) inside what is really visible when the phone keyboard is open.
 * The keyboard shrinks the *visual* viewport, not the page, so a fixed "inset-0" window kept its old
 * size and the browser scrolled the page to reach the text box — pushing the header and the messages
 * off the top. While `active`, this publishes the visible height and offset as --vv-h / --vv-top
 * (use them for height and top) and keeps the page behind from scrolling.
 */
export function useKeyboardFit(active = true) {
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const unlock = lockScroll();
    const apply = () => {
      if (!vv) return;
      root.style.setProperty("--vv-h", `${vv.height}px`);
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      root.style.removeProperty("--vv-h");
      root.style.removeProperty("--vv-top");
      unlock();
    };
  }, [active]);
}

/**
 * Makes the phone's Back button close an in-page screen (a conversation opened over a list) instead
 * of leaving the whole page. Opening adds a history step; Back removes it and calls `close`;
 * closing from the screen's own Back button removes the step again.
 */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    // Keep the router's own state on the new entry so Next.js doesn't treat Back as an unknown page.
    window.history.pushState(window.history.state, "", window.location.href);
    let ours = true;
    const onPop = () => {
      ours = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (ours) window.history.back();
    };
  }, [open]);
}
