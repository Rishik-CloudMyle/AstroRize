"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The astrologer's photo gallery on their public profile: a grid on wider screens, a
 * swipeable strip (scroll-snap) on phones. A photo opens in a lightbox. With no photos yet,
 * three quiet placeholder tiles and "Photos coming soon" (never stock or fake photos).
 */
export default function ProfileGallery({ photos, name, variant = "section" }: { photos: string[]; name: string; variant?: "section" | "strip" }) {
  const [open, setOpen] = useState<number | null>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => {
    setOpen((i) => {
      // Focus goes back to the photo that was open.
      if (i !== null) requestAnimationFrame(() => thumbs.current[i]?.focus());
      return null;
    });
  }, []);

  // Phone/tablet profile (the app's thumbnail row): square thumbnails, nothing at all without photos.
  if (variant === "strip") {
    if (photos.length === 0) return null;
    return (
      <section aria-label={`Photos from ${name}`}>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((src, i) => (
            <li key={src} className="w-[calc((100%-32px)/5)] min-w-[60px] flex-none">
              <button
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Open photo ${i + 1} of ${photos.length}`}
                className="relative block aspect-[66/56] w-full overflow-hidden rounded-[10px] sm:aspect-auto sm:h-14 border border-app-line bg-app-tint-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-selected"
              >
                <Image src={src} alt="" fill unoptimized loading="lazy" sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
        {open !== null && photos[open] && <Lightbox photos={photos} name={name} index={open} onIndex={setOpen} onClose={close} />}
      </section>
    );
  }

  return (
    <section aria-labelledby="gallery-title" className="mt-[18px] rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="gallery-title" className="text-lg font-bold text-ink">
          Photos
        </h2>
        {photos.length > 0 && (
          <span className="text-[11.5px] text-stone-500">
            {photos.length} {photos.length === 1 ? "photo" : "photos"}
          </span>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="mt-3.5">
          <div className="grid grid-cols-3 gap-2.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-dashed border-amber-300/80 bg-[radial-gradient(circle_at_30%_20%,#fffaf0,#f7efe1)]"
              >
                <span className="pointer-events-none absolute inset-0 bg-[repeating-conic-gradient(from_8deg_at_50%_120%,rgba(212,160,48,.10)_0_5deg,transparent_5deg_14deg)]" />
                <span className="relative text-[20px] text-amber-400/90">✦</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-stone-500">Photos coming soon. {name} hasn&apos;t added any photos yet.</p>
        </div>
      ) : (
        <ul className="-mx-5 mt-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {photos.map((src, i) => (
            <li key={src} className="w-[72%] flex-none snap-start min-[480px]:w-[45%] sm:w-auto">
              <button
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Open photo ${i + 1} of ${photos.length}`}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line-warm bg-cream shadow-[0_8px_20px_rgba(90,62,40,.06)]"
              >
                <Image
                  src={src}
                  alt={`Photo ${i + 1} from ${name}`}
                  fill
                  unoptimized
                  loading="lazy"
                  sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 72vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open !== null && photos[open] && <Lightbox photos={photos} name={name} index={open} onIndex={setOpen} onClose={close} />}
    </section>
  );
}

/** Full-screen photo viewer: ✕ / Esc closes, arrows (keys, buttons or a swipe) step through. Focus stays inside. */
function Lightbox({
  photos,
  name,
  index,
  onIndex,
  onClose,
}: {
  photos: string[];
  name: string;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const n = photos.length;
  const step = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && n > 1) {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight" && n > 1) {
        e.preventDefault();
        step(1);
      } else if (e.key === "Tab") {
        // Keep keyboard focus inside the viewer.
        // Only the buttons shown at this width (the arrows sit in different places on phones).
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])].filter((b) => b.offsetParent !== null);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose, step]);

  const arrow = "grid size-11 shrink-0 place-items-center rounded-full bg-white/12 text-[20px] text-white transition-colors hover:bg-white/25";

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={`Photos from ${name}`}
      className="fixed inset-0 z-[120] flex flex-col bg-[rgba(18,14,11,.94)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 text-white">
        <span className="text-[13px] font-semibold text-white/80 tabular-nums" aria-live="polite">
          {index + 1} / {n}
        </span>
        <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close photos" className={arrow}>
          ✕
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center gap-3 px-2 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start === null || end === undefined || n < 2) return;
          if (Math.abs(end - start) > 45) step(end < start ? 1 : -1);
        }}
      >
        {n > 1 && (
          <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className={`${arrow} hidden sm:grid`}>
            ‹
          </button>
        )}
        <div className="relative h-full max-h-[82vh] w-full max-w-[1000px]">
          <Image
            key={photos[index]}
            src={photos[index]!}
            alt={`Photo ${index + 1} from ${name}`}
            fill
            unoptimized
            sizes="100vw"
            className="object-contain"
          />
        </div>
        {n > 1 && (
          <button type="button" onClick={() => step(1)} aria-label="Next photo" className={`${arrow} hidden sm:grid`}>
            ›
          </button>
        )}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:hidden">
          <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className={arrow}>
            ‹
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next photo" className={arrow}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
