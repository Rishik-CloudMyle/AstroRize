// Home hero animation: the Navagraha (nine Vedic planets) circling the Sun in 3D — the orbital
// plane leans away from the viewer, so planets swing in front of and behind the Sun and grow as
// they come closer. Light theme, to sit on the site's cream background. Pure CSS animation.
//
// "Live": every planet starts at its real position in the sky when the page loads (sidereal
// longitude from src/lib/sky.ts) and is labelled with its current rashi. From there the motion is
// illustrative — planets keep circling (anticlockwise, the way longitude grows), while Rahu and
// Ketu move backwards, as the lunar nodes do.
//
// The client wants the sky to always revolve, so it keeps moving even when the device asks for
// reduced motion (globals.css exempts it). Continuous motion must be stoppable (WCAG 2.2.2), so
// there is a Pause / Play button next to the "Live sky" caption.

"use client";

import { useState } from "react";
import type { GrahaKey, GrahaPosition } from "@/lib/sky";

/** How far the orbital plane leans back, in degrees (0 = seen from straight above). */
const TILT = 58;

interface Graha {
  key: Exclude<GrahaKey, "sun">;
  /** Sanskrit name shown on the label. */
  name: string;
  /** Orbit radius as a % of the box (50 = touches the edge). */
  orbit: number;
  /** Planet diameter as a % of the box. */
  size: number;
  /** Seconds per revolution. */
  period: number;
  fill: string;
  trail: string;
  ring?: boolean;
  /** Rahu and Ketu move backwards through the zodiac. */
  retrograde?: boolean;
}

const GRAHAS: Graha[] = [
  { key: "mercury", name: "Budha", orbit: 13.5, size: 3.8, period: 6, fill: "radial-gradient(circle at 32% 30%, #d9ffe7, #2fa565 55%, #145c33)", trail: "#2fa565" },
  { key: "venus", name: "Shukra", orbit: 19, size: 4.8, period: 9, fill: "radial-gradient(circle at 32% 30%, #fffdf5, #f0d7a4 50%, #b88a4a)", trail: "#d9b373" },
  { key: "moon", name: "Chandra", orbit: 24.5, size: 4.4, period: 12, fill: "radial-gradient(circle at 32% 30%, #ffffff, #c9cfdb 55%, #6f7688)", trail: "#a9b0c0" },
  { key: "mars", name: "Mangal", orbit: 30, size: 4.6, period: 16, fill: "radial-gradient(circle at 32% 30%, #ffc2a0, #dc4a1f 55%, #7f1d0b)", trail: "#dc4a1f" },
  { key: "jupiter", name: "Guru", orbit: 36, size: 9, period: 22, fill: "radial-gradient(circle at 32% 30%, #fff1c2, #e9a12b 50%, #93560a)", trail: "#e9a12b" },
  { key: "saturn", name: "Shani", orbit: 42, size: 7.2, period: 30, fill: "radial-gradient(circle at 32% 30%, #f6ecd2, #b0924f 55%, #5a4522)", trail: "#b0924f", ring: true },
  { key: "rahu", name: "Rahu", orbit: 48, size: 4, period: 40, fill: "radial-gradient(circle at 32% 30%, #b3a6d1, #5a4886 60%, #2a1f45)", trail: "#6f5ba0", retrograde: true },
  { key: "ketu", name: "Ketu", orbit: 48, size: 4, period: 40, fill: "radial-gradient(circle at 32% 30%, #d9bfa9, #8a5b3d 60%, #3f271a)", trail: "#a06f4c", retrograde: true },
];

const keep3d = { transformStyle: "preserve-3d" } as const;

/** Screen angle for a sidereal longitude: 0° Mesha at the top, longitude growing anticlockwise. */
const angleOf = (longitude: number) => -Math.round(longitude * 100) / 100;

/** One body on its orbit. `lag` (degrees behind) and `ghost` draw the fading glow trail. */
function Body({ g, start, lag = 0, ghost = 0, rashi }: { g: Graha; start: number; lag?: number; ghost?: number; rashi?: string }) {
  // Anticlockwise for planets, clockwise for the nodes; the trail sits behind the direction of travel.
  const spin = g.retrograde ? "az-sky-cw" : "az-sky-ccw";
  const unspin = g.retrograde ? "az-sky-ccw" : "az-sky-cw";
  const angle = start + (g.retrograde ? -lag : lag);
  return (
    <div className="absolute inset-0" style={{ ...keep3d, transform: `rotate(${angle}deg)` }}>
      <div className={`${spin} absolute inset-0`} style={{ ...keep3d, "--period": `${g.period}s` } as React.CSSProperties}>
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ ...keep3d, top: `${50 - g.orbit}%`, width: `${g.size}%`, height: `${g.size}%` }}
        >
          {/* Undo the circling and the tilt, so the body always faces the viewer. */}
          <div className="size-full" style={{ ...keep3d, transform: `rotate(${-angle}deg)` }}>
            <div className={`${unspin} size-full`} style={{ ...keep3d, "--period": `${g.period}s` } as React.CSSProperties}>
              <div className="relative size-full" style={{ transform: `rotateX(${-TILT}deg)` }}>
                {ghost ? (
                  <span className="block size-full scale-50 rounded-full blur-[1.5px]" style={{ background: g.trail, opacity: ghost }} />
                ) : (
                  <>
                    <span
                      className="block size-full rounded-full"
                      style={{ background: g.fill, boxShadow: "0 3px 8px rgba(92,58,20,.35), 0 0 12px rgba(255,200,90,.5)" }}
                    />
                    {g.ring && (
                      <span className="absolute left-1/2 top-1/2 h-[40%] w-[235%] -translate-x-1/2 -translate-y-1/2 rotate-[-16deg] rounded-[50%] border-2 border-[#9a7a3e]" />
                    )}
                    {rashi && (
                      <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold leading-tight text-amber-950 [text-shadow:0_0_3px_#fff,0_0_6px_#fff8e6] sm:text-[11px]">
                        {g.name}
                        {/* Phones show just the name, so the labels at the edges still fit. */}
                        <span className="hidden sm:inline"> · {rashi}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The 3D solar system. Square box — size and place it with `className`. Hidden from screen readers. */
function NavagrahaSky({ positions, paused, className = "" }: { positions: Record<GrahaKey, GrahaPosition>; paused: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-paused={paused}
      className={`az-sky pointer-events-none aspect-square ${className}`}
      style={{ perspective: "1600px" }}
    >
      <div className="relative size-full" style={{ ...keep3d, transform: `rotateX(${TILT}deg)` }}>
        {[...new Set(GRAHAS.map((g) => g.orbit))].map((r) => (
          <span
            key={r}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-amber-800/30"
            style={{ width: `${r * 2}%`, height: `${r * 2}%` }}
          />
        ))}
        {/* The Sun stands upright in the middle of the tilted plane. */}
        <div className="absolute left-1/2 top-1/2 size-[17%] -translate-x-1/2 -translate-y-1/2" style={keep3d}>
          <div className="relative size-full" style={{ transform: `rotateX(${-TILT}deg)` }}>
            <span className="az-sun-light block size-full rounded-full bg-[radial-gradient(circle_at_40%_38%,#fffbe6,#ffd54a_40%,#f59e0b_72%,#c2410c)]" />
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold leading-tight text-amber-950 [text-shadow:0_0_3px_#fff,0_0_6px_#fff8e6] sm:text-[11px]">
              Surya<span className="hidden sm:inline"> · {positions.sun.rashi}</span>
            </span>
          </div>
        </div>
        {GRAHAS.map((g) => {
          const start = angleOf(positions[g.key].longitude);
          return [
            <Body key={`${g.key}-t2`} g={g} start={start} lag={10} ghost={0.12} />,
            <Body key={`${g.key}-t1`} g={g} start={start} lag={5} ghost={0.22} />,
            <Body key={g.key} g={g} start={start} rashi={positions[g.key].rashi} />,
          ];
        })}
      </div>
    </div>
  );
}

/**
 * The hero's right-hand side: the live sky behind `children` (the astrologer list), with the
 * "Live sky" caption and the Pause / Play control underneath.
 */
export default function LiveSky({
  positions,
  skyTime,
  skyClassName,
  className = "",
  children,
}: {
  positions: Record<GrahaKey, GrahaPosition>;
  /** When the positions were calculated, e.g. "8 Oct, 3:50 pm". */
  skyTime: string;
  skyClassName: string;
  /** Extra classes for the wrapper, e.g. to nudge it sideways. */
  className?: string;
  children: React.ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`relative isolate min-w-0 ${className}`}>
      <NavagrahaSky positions={positions} paused={paused} className={`absolute -z-10 ${skyClassName}`} />
      {children}
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11.5px] font-semibold text-amber-900/75">
        <span>
          <span className="az-live-dot mr-1.5 inline-block size-1.5 rounded-full bg-urgent align-middle" />
          Live sky · planet positions as of {skyTime} IST
        </span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="rounded-full border border-amber-900/20 bg-white/60 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-white"
        >
          {paused ? "▶ Play" : "❚❚ Pause"}
        </button>
      </p>
    </div>
  );
}

/** A fixed scatter of soft gold sparkles for the hero background (same on server and client). */
const SPARKLES = Array.from({ length: 60 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  // Rounded to fixed decimals: the browser normalises long decimals in style attributes, which
  // would otherwise differ from the server's HTML when React hydrates.
  return { x: `${(r(1) * 100).toFixed(2)}%`, y: `${(r(2) * 100).toFixed(2)}%`, s: `${2 + Math.round(r(3) * 2)}px`, d: `${(r(4) * 4).toFixed(2)}s`, t: `${(2.5 + r(5) * 3).toFixed(2)}s` };
});

export function Sparkles({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="az-twinkle absolute rounded-full bg-amber-400"
          style={{ left: s.x, top: s.y, width: s.s, height: s.s, animationDelay: s.d, animationDuration: s.t }}
        />
      ))}
    </div>
  );
}
