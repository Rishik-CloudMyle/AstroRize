// Home hero: the "celestial dial" — the nine grahas on their orbit rings inside a round night-sky
// plate with a graduated zodiac rim, drawn on a canvas. Decorative: no text in the drawing, hidden
// from screen readers.
//
// Real sky: every graha starts where it truly is now (sidereal, Lahiri — src/lib/sky.ts) and
// moves as a time-lapse at its real speed, one day a second: the Moon fastest, Saturn slowest,
// Rahu and Ketu backwards and exactly opposite, and the planets' retrograde loops when they
// happen. The view is from the Earth (centre), looking down on the zodiac: 0° Mesha on the left,
// signs running anticlockwise. Each planet swings slightly in and out with its real distance, so
// backwards stretches draw a loop. The nakshatra the Moon is passing through glows on the rim.
//
// It always plays — the client wants the sky moving for everyone, including visitors whose OS
// asks for reduced motion — and has one Pause / Play button for anyone who wants it still
// (WCAG 2.2.2). It only runs while the dial is on screen and the tab is visible.

"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_MS, GRAHA_KEYS, grahaSamples, type GrahaKey, type GrahaSample } from "@/lib/sky";

/** Time-lapse speed: sky days per real second. */
const DAYS_PER_SECOND = 1;
/** Positions are sampled every half day and interpolated in between. */
const STEP_DAYS = 0.5;
/** Redraw at most this often (ms) — about 30 frames a second is plenty for this motion. */
const FRAME_MS = 32;
/** Orbit unit R as a fraction of the dial's radius D (the outermost ring, the nodes', sits at R). */
const ORBIT = 0.78;
/** The zodiac rim's inner and outer edge, and the nakshatra ring, as fractions of D. */
const RIM = [0.885, 0.972] as const;
const NAKSHATRA_RING = 0.855;
/** Most the inner sky shifts with the mouse, in pixels (the rim stays put, which gives depth). */
const PARALLAX = 6;

interface Look {
  /** Orbit radius as a fraction of R. */
  ring: number;
  /** Disc radius as a fraction of R. */
  size: number;
  /** Highlight, body and shadow colours of the disc. */
  fill: [string, string, string];
  /** Glow colour, as "r,g,b". */
  glow: string;
  /** Days of trail behind it. */
  trail: number;
}

// Traditional Vedic colours: copper-gold Sun, white Moon, red Mars, green Mercury, yellow Jupiter,
// pearl Venus, blue Saturn, smoky Rahu and Ketu — lifted a little to read on the night plate.
const LOOK: Record<GrahaKey, Look> = {
  moon: { ring: 0.3, size: 0.044, fill: ["#ffffff", "#e6e9f2", "#8f98ad"], glow: "214,222,240", trail: 2.5 },
  mercury: { ring: 0.4, size: 0.03, fill: ["#d4fbe0", "#22c55e", "#166534"], glow: "74,222,128", trail: 18 },
  venus: { ring: 0.5, size: 0.04, fill: ["#ffffff", "#fbe4ee", "#c49aae"], glow: "255,214,232", trail: 18 },
  sun: { ring: 0.6, size: 0.072, fill: ["#fff6c9", "#f8a815", "#c2410c"], glow: "251,176,36", trail: 14 },
  mars: { ring: 0.69, size: 0.034, fill: ["#ffb4a0", "#ef4430", "#7f1d1d"], glow: "239,68,48", trail: 34 },
  jupiter: { ring: 0.78, size: 0.056, fill: ["#fff4b8", "#eab308", "#92400e"], glow: "234,179,8", trail: 60 },
  saturn: { ring: 0.87, size: 0.044, fill: ["#dbe0ff", "#6d72f0", "#312e81"], glow: "129,140,248", trail: 60 },
  rahu: { ring: 1, size: 0.03, fill: ["#e2e8f0", "#7c8798", "#334155"], glow: "148,163,184", trail: 40 },
  ketu: { ring: 1, size: 0.03, fill: ["#f3dcc2", "#b07d58", "#4a3222"], glow: "196,145,104", trail: 40 },
};
const RINGS = [...new Set(GRAHA_KEYS.map((k) => LOOK[k].ring))];
const MAX_TRAIL = Math.max(...GRAHA_KEYS.map((k) => LOOK[k].trail));
const TAU = Math.PI * 2;

/** A fixed field of faint stars inside the plate: polar position (fraction of D), size, twinkle phase. */
const STARS = Array.from({ length: 90 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { a: r(1) * TAU, d: 0.12 + Math.sqrt(r(2)) * 0.7, s: 0.5 + r(3) * 0.9, p: r(4) * TAU, f: 0.6 + r(5) * 1.4 };
});

/** Half-day samples, computed on demand and dropped once they fall off the longest trail. */
class SkyCache {
  private samples = new Map<number, Record<GrahaKey, GrahaSample>>();
  constructor(private start: number) {}
  at(index: number) {
    let s = this.samples.get(index);
    if (!s) {
      s = grahaSamples(new Date(this.start + index * STEP_DAYS * DAY_MS));
      this.samples.set(index, s);
    }
    return s;
  }
  prune(before: number) {
    for (const k of this.samples.keys()) if (k < before) this.samples.delete(k);
  }
}

/** Interpolated longitude (degrees, unwrapped near `a`) and nearness between two samples. */
function blend(a: GrahaSample, b: GrahaSample, f: number): GrahaSample {
  let d = b.longitude - a.longitude;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return { longitude: a.longitude + d * f, nearFar: a.nearFar + (b.nearFar - a.nearFar) * f };
}

/** Canvas angle for a sidereal longitude: 0° Mesha on the left, growing anticlockwise. */
const angle = (lon: number) => Math.PI - (lon * Math.PI) / 180;

function draw(ctx: CanvasRenderingContext2D, side: number, cache: SkyCache, day: number, sweep: number, clock: number, par: { x: number; y: number }) {
  ctx.clearRect(0, 0, side, side);
  const c = side / 2;
  const D = side / 2;
  const R = D * ORBIT;
  /** Screen point for a longitude at radius r (pixels); the inner sky shifts with the parallax. */
  const at = (lon: number, r: number) => {
    const t = angle(lon);
    const p = r / R;
    return { x: c + r * Math.cos(t) + par.x * p, y: c + r * Math.sin(t) + par.y * p };
  };
  const circle = (r: number, shift = 0) => {
    ctx.beginPath();
    ctx.arc(c + par.x * shift, c + par.y * shift, r, 0, TAU);
  };

  // Warm light at the centre (the Earth's place) and a faint star field.
  const halo = ctx.createRadialGradient(c, c, 0, c, c, D * 0.62);
  halo.addColorStop(0, "rgba(251,191,36,.16)");
  halo.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = "#fff7e0";
  for (const s of STARS) {
    ctx.globalAlpha = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(clock * s.f + s.p));
    ctx.beginPath();
    ctx.arc(c + Math.cos(s.a) * s.d * D + par.x * 0.4, c + Math.sin(s.a) * s.d * D + par.y * 0.4, Math.max(0.5, s.s * (D / 260)), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Zodiac rim: a gold band with degree graduations, the twelve rashi dividers, a small star in
  // the middle of each sign, and a slow light travelling round it.
  const [ri, ro] = [RIM[0] * D, RIM[1] * D];
  ctx.lineCap = "butt";
  ctx.lineWidth = ro - ri;
  ctx.strokeStyle = "rgba(226,176,58,.07)";
  circle((ri + ro) / 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(226,176,58,.55)";
  circle(ro);
  ctx.stroke();
  // The light: a bright head running anticlockwise along the rim's outer edge, fading behind.
  const SEG = 36;
  ctx.lineWidth = Math.max(1.5, D * 0.008);
  for (let i = 0; i < SEG; i++) {
    const a = sweep + i * 0.025;
    ctx.strokeStyle = `rgba(255,236,170,${(0.85 * (1 - i / SEG) ** 1.8).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(c, c, ro - ctx.lineWidth / 2, a, a + 0.026);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(226,176,58,.4)";
  circle(ri);
  ctx.stroke();
  const tick = (deg: number, from: number, to: number) => {
    const t = angle(deg);
    ctx.moveTo(c + from * Math.cos(t), c + from * Math.sin(t));
    ctx.lineTo(c + to * Math.cos(t), c + to * Math.sin(t));
  };
  const span = ro - ri;
  ctx.strokeStyle = "rgba(226,176,58,.22)";
  ctx.beginPath();
  for (let d = 0; d < 360; d++) if (d % 5) tick(d, ro, ro - span * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(226,176,58,.42)";
  ctx.beginPath();
  for (let d = 0; d < 360; d += 5) if (d % 30) tick(d, ro, ro - span * 0.34);
  ctx.stroke();
  ctx.strokeStyle = "rgba(226,176,58,.7)";
  ctx.beginPath();
  for (let d = 0; d < 360; d += 30) tick(d, ro, ri);
  ctx.stroke();
  ctx.fillStyle = "rgba(253,224,138,.75)";
  const star = Math.max(1.6, span * 0.16);
  for (let i = 0; i < 12; i++) {
    const t = angle(i * 30 + 15);
    const m = ri + span * 0.38;
    const x = c + m * Math.cos(t);
    const y = c + m * Math.sin(t);
    ctx.beginPath();
    ctx.moveTo(x, y - star);
    ctx.quadraticCurveTo(x, y, x + star, y);
    ctx.quadraticCurveTo(x, y, x, y + star);
    ctx.quadraticCurveTo(x, y, x - star, y);
    ctx.quadraticCurveTo(x, y, x, y - star);
    ctx.fill();
  }

  // Where everything is, at `day`.
  const i0 = Math.floor(day / STEP_DAYS);
  const f = day / STEP_DAYS - i0;
  const now = cache.at(i0);
  const next = cache.at(i0 + 1);
  const heads = Object.fromEntries(GRAHA_KEYS.map((k) => [k, blend(now[k], next[k], f)])) as Record<GrahaKey, GrahaSample>;

  // Twenty-seven nakshatra points just inside the rim; the Moon's current one is lit.
  const moonStar = Math.floor((((heads.moon.longitude % 360) + 360) % 360) / (360 / 27));
  const nr = NAKSHATRA_RING * D;
  for (let i = 0; i < 27; i++) {
    const t = angle((i + 0.5) * (360 / 27));
    const x = c + nr * Math.cos(t);
    const y = c + nr * Math.sin(t);
    const lit = i === moonStar;
    if (lit) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, D * 0.04);
      g.addColorStop(0, "rgba(226,232,255,.55)");
      g.addColorStop(1, "rgba(226,232,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, D * 0.04, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = lit ? "rgba(255,255,255,.95)" : "rgba(226,176,58,.5)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(lit ? 1.6 : 0.9, D * (lit ? 0.009 : 0.0055)), 0, TAU);
    ctx.fill();
  }

  // Orbit rings; the nodes' ring is dashed (Rahu and Ketu are points, not bodies).
  for (const ring of RINGS) {
    ctx.strokeStyle = ring === 1 ? "rgba(196,181,253,.24)" : "rgba(226,176,58,.17)";
    ctx.setLineDash(ring === 1 ? [3, 5] : []);
    circle(ring * R, ring);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Trails: back along each graha's path, brightest at the planet, gone at the tail.
  const radius = (k: GrahaKey, s: GrahaSample) => LOOK[k].ring * R * (1 + 0.12 * (s.nearFar - 0.5));
  ctx.lineCap = "round";
  for (const k of GRAHA_KEYS) {
    const look = LOOK[k];
    const steps = Math.round(look.trail / STEP_DAYS);
    const points = [at(heads[k].longitude, radius(k, heads[k]))];
    for (let j = 0; j < steps; j++) {
      const s = cache.at(i0 - j)[k];
      points.push(at(s.longitude, radius(k, s)));
    }
    ctx.lineWidth = Math.max(1, look.size * R * 0.55);
    const groups = 8;
    for (let g = 0; g < groups; g++) {
      const from = Math.floor((g * (points.length - 1)) / groups);
      const to = Math.floor(((g + 1) * (points.length - 1)) / groups);
      if (to <= from) continue;
      ctx.strokeStyle = `rgba(${look.glow},${(0.4 * (1 - g / groups) ** 1.6).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(points[from]!.x, points[from]!.y);
      for (let j = from + 1; j <= to; j++) ctx.lineTo(points[j]!.x, points[j]!.y);
      ctx.stroke();
    }
  }

  // Bodies, the Sun last so its glow sits over the others' trails.
  for (const k of [...GRAHA_KEYS.filter((g) => g !== "sun"), "sun" as const]) {
    const look = LOOK[k];
    const s = heads[k];
    const p = at(s.longitude, radius(k, s));
    // Nearer the Earth looks a little bigger.
    const r = Math.max(2.5, look.size * R * (1 + 0.3 * (0.5 - s.nearFar)));
    const reach = r * (k === "sun" ? 4 : 2.8);
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, reach);
    glow.addColorStop(0, `rgba(${look.glow},${k === "sun" ? 0.6 : 0.42})`);
    glow.addColorStop(1, `rgba(${look.glow},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, reach, 0, TAU);
    ctx.fill();

    const body = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    body.addColorStop(0, look.fill[0]);
    body.addColorStop(0.55, look.fill[1]);
    body.addColorStop(1, look.fill[2]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();

    if (k === "saturn") {
      ctx.strokeStyle = "rgba(199,210,254,.85)";
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 1.9, r * 0.55, -0.32, 0, TAU);
      ctx.stroke();
    }
  }

  // The Earth at the centre: a small blue-green world with a thin gold ring.
  const er = Math.max(3, D * 0.026);
  const ex = c + par.x * 0.02;
  const ey = c + par.y * 0.02;
  const earth = ctx.createRadialGradient(ex - er * 0.35, ey - er * 0.4, er * 0.1, ex, ey, er);
  earth.addColorStop(0, "#d1fae5");
  earth.addColorStop(0.5, "#38bdf8");
  earth.addColorStop(1, "#1e3a8a");
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,176,58,.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ex, ey, er + 3, 0, TAU);
  ctx.stroke();

  cache.prune(i0 - Math.ceil(MAX_TRAIL / STEP_DAYS) - 2);
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <rect x="1.5" y="1" width="2.4" height="8" rx=".6" />
      <rect x="6.1" y="1" width="2.4" height="8" rx=".6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2.2 1.1v7.8a.5.5 0 0 0 .76.43l6.3-3.9a.5.5 0 0 0 0-.86L2.96.67a.5.5 0 0 0-.76.43z" />
    </svg>
  );
}

/**
 * The dial (size it with `className`, which sets its width; it stays square) with, under it, a
 * one-line caption and the Pause / Play button.
 */
export default function HeroSky({ className = "" }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  // null until mounted: the server cannot know the visitor's clock.
  const [skyDate, setSkyDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pausedRef = useRef(paused);
  // Lets the Pause / Play button reach the animation loop.
  const tickerRef = useRef<{ update: () => void } | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !canvas || !ctx) return;

    const start = Date.now();
    const cache = new SkyCache(start);
    let day = 0; // sky days since `start`
    let clock = 0; // real seconds of motion, for the stars' twinkle
    let side = 0;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let shownDate = "";
    // Slow light round the zodiac (one turn a minute) and the pointer parallax, eased.
    let sweep = 0;
    const par = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const dateText = () =>
      new Date(start + day * DAY_MS).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

    const paint = () => {
      if (side < 24) return; // not laid out yet
      draw(ctx, side, cache, day, sweep, clock, par);
      const text = dateText();
      if (text !== shownDate) {
        shownDate = text;
        setSkyDate(text);
      }
    };

    const resize = () => {
      const rect = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      side = Math.min(rect.width, rect.height);
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = t;
      const dt = t - last;
      if (dt < FRAME_MS) return;
      last = t;
      const sec = Math.min(dt, 100) / 1000; // no leap after the tab was away
      day += sec * DAYS_PER_SECOND;
      clock += sec;
      sweep = (sweep - (sec * TAU) / 60) % TAU; // anticlockwise, with the signs
      par.x += (target.x - par.x) * 0.06;
      par.y += (target.y - par.y) * 0.06;
      paint();
    };

    const shouldRun = () => !pausedRef.current && onScreen && document.visibilityState === "visible";
    const update = () => {
      if (shouldRun()) {
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      update();
    });
    io.observe(box);
    document.addEventListener("visibilitychange", update);

    // A few pixels of depth as a mouse moves (outer rings shift most). Not on touch screens.
    const fine = window.matchMedia("(pointer: fine)").matches;
    const onPointer = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * -2 * PARALLAX;
      target.y = (e.clientY / window.innerHeight - 0.5) * -2 * PARALLAX;
    };
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

    resize();
    setReady(true);
    tickerRef.current = { update };
    update();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      if (fine) window.removeEventListener("pointermove", onPointer);
      tickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    tickerRef.current?.update();
  }, [paused]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* The plate: a faint outer ring, the night-sky disc with its gold edge, and the canvas on it. */}
      <div aria-hidden="true" className="pointer-events-none relative aspect-square w-full">
        <span className="absolute -inset-2.5 rounded-full border border-amber-900/15 sm:-inset-3.5" />
        <span className="absolute -inset-1 rounded-full bg-[conic-gradient(from_200deg,#f4d58a,#b9832a,#f9e6b4,#a8741f,#f4d58a)] shadow-[0_30px_70px_rgba(76,29,149,.22),0_12px_28px_rgba(120,53,15,.18)]" />
        <div
          ref={boxRef}
          className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_45%,#33205a_0%,#24153f_48%,#170d2a_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,.45)]"
        >
          <canvas ref={canvasRef} className={`size-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`} />
        </div>
      </div>
      <p className="mt-5 flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-center text-[12px] font-semibold text-amber-900/80 sm:mt-6">
        {/* On phones the date and the button share a second line. */}
        <span className="max-sm:basis-full">Today&apos;s real sky, a day a second</span>
        {/* Its own piece, so on a narrow screen it wraps whole; fixed width so nothing shifts as it changes. */}
        {skyDate && (
          <span className="inline-block min-w-[12ch] whitespace-nowrap tabular-nums">
            <span className="mr-1.5 max-sm:hidden">·</span>
            {skyDate}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the planets" : "Pause the planets"}
          className="inline-flex h-7 sm:ml-1.5 max-sm:ml-1 items-center gap-1.5 rounded-full border border-amber-900/20 bg-white/70 px-3 text-[11px] font-bold text-amber-900 hover:bg-white"
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
          {paused ? "Play" : "Pause"}
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
