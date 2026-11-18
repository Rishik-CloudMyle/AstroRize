// One shared lock on page scrolling for every full-screen window, sheet and dialog.
//
// Each window used to remember the body's overflow, set it to "hidden", and put the old value back
// when it closed. With two windows open at once (the call flow and the session window inside it)
// they closed in the "wrong" order and put back "hidden" — the page then could not scroll or be used
// until it was reloaded. Counting the locks means the page is released only when the last one lets go.

let locks = 0;

/** Locks page scrolling; call the returned function to release it (safe to call twice). */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks++ === 0) document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = "";
  };
}
