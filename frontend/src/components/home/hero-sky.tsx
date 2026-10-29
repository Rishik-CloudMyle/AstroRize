// Home hero: the golden zodiac wheel — an engraved gold rashi chakra on the cream page, with the
// nine grahas set on it as small gems. Drawn on a canvas (hidden from screen readers; the
// planets are offered to them as buttons instead). Also here: the hero's sparkles and shooting stars.
//
// Outside in: a beaded rim, a degree scale (1°, 5°, 30°), the twelve rashi with their glyphs, a
// scalloped filigree, the gem track, the twenty-seven nakshatra points, and a rosette round a
// small engraved sun with a warm glow. The whole wheel turns very slowly (once in four minutes).
//
// Real sky: every graha sits on the wheel at its true sidereal longitude now (Lahiri —
// src/lib/sky.ts) and moves on as a gentle time-lapse at its real speed, half a day a second:
// the Moon fastest, Saturn barely, Rahu and Ketu backwards and exactly opposite, retrogrades
// when they really happen. 0° Mesha is on the left, signs run anticlockwise. When two gems meet,
// the faster one swings inwards round the slower one, which keeps its place — the Moon overtakes
// everyone without pushing anyone aside.
//
// Each gem draws a fading trail of its own colour behind it, as long as its real speed (the Moon's
// is long, Saturn's barely there). The Moon pearl shows its real phase, lit on the side facing the
// Sun gem. A graha entering a new rashi sends out a soft ripple and lights that sign's band for a
// moment. Behind it all, faint rays turn slowly round the engraved sun.
//
// Close conjunctions are joined by a faint gold line that fades in as the grahas meet. Hovering a
// gem (or tapping it, or reaching it by keyboard) opens a small card with its rashi, degree,
// nakshatra and retrograde state, and with a mouse the wheel tilts a little to face it.
//
// It always plays, for everyone, with no pause control (the client's call — including visitors
// whose OS asks for reduced motion). It only runs while the wheel is on screen and the tab is visible.

"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DAY_MS, GRAHA_KEYS, GRAHA_NAMES, grahaSamples, placeOf, type GrahaKey, type GrahaSample } from "@/lib/sky";

/** Time-lapse speed: sky days per real second. */
const DAYS_PER_SECOND = 0.5;
/** Seconds for one turn of the wheel. */
const TURN_SECONDS = 240;
/** Positions are sampled every half day and interpolated in between. */
const STEP_DAYS = 0.5;
/** Redraw at most this often (ms) — about 30 frames a second is plenty for this motion. */
const FRAME_MS = 32;
const TAU = Math.PI * 2;

/** Radii as fractions of the wheel's radius D. */
const RAD = {
  rim: 0.975,
  beads: 0.952,
  scaleOut: 0.93,
  signOut: 0.868,
  glyph: 0.795,
  signIn: 0.722,
  track: 0.632,
  nakOut: 0.522,
  nakDot: 0.501,
  nakIn: 0.48,
  inner: 0.43,
  rosette: 0.405,
  core: 0.165,
} as const;
/**
 * How far a gem steps inwards (fraction of D) to clear another one; the faster gem starts to make
 * room when it comes within CLEAR_DEG of a slower one and has stepped right in by FULL_DEG.
 */
const LANE = 0.085;
const CLEAR_DEG = 11;
const FULL_DEG = 5;

interface Gem {
  /** Stone radius as a fraction of D. */
  size: number;
  /** Highlight, body and edge colours. */
  fill: [string, string, string];
  /** Glow colour, "r,g,b". */
  glow: string;
  /** Facet lines: light stones get darker lines. */
  facet: string;
  /** Round and polished (pearl, coral) rather than cut. */
  round?: boolean;
  /** A cat's eye: a polished cabochon with a bright band of light across it. */
  eye?: boolean;
}

// Each graha's stone, after the navaratna: Sun ruby (Manikya), Moon pearl (Moti), Mars red coral
// (Moonga), Mercury emerald (Panna), Jupiter yellow sapphire (Pukhraj), Venus diamond (Heera),
// Saturn blue sapphire (Neelam), Rahu hessonite (Gomed), Ketu cat's eye (Lehsunia).
const GEMS: Record<GrahaKey, Gem> = {
  sun: { size: 0.044, fill: ["#ffc2d4", "#d0104c", "#5c0322"], glow: "214,24,80", facet: "rgba(255,222,232,.55)" },
  moon: { size: 0.035, fill: ["#ffffff", "#f3eee8", "#b8adc0"], glow: "214,204,226", facet: "", round: true },
  mars: { size: 0.031, fill: ["#ffc9b3", "#f0583a", "#8e2410"], glow: "240,92,58", facet: "", round: true },
  mercury: { size: 0.029, fill: ["#c4f7da", "#139c58", "#05472a"], glow: "22,160,92", facet: "rgba(220,255,236,.5)" },
  jupiter: { size: 0.037, fill: ["#fff7b8", "#efc40c", "#946300"], glow: "236,196,20", facet: "rgba(255,252,225,.6)" },
  venus: { size: 0.034, fill: ["#ffffff", "#eef3fa", "#93a4ba"], glow: "190,214,244", facet: "rgba(90,110,140,.35)" },
  saturn: { size: 0.034, fill: ["#bccbff", "#2545c4", "#0b1857"], glow: "48,78,206", facet: "rgba(220,230,255,.5)" },
  rahu: { size: 0.028, fill: ["#e2d9cc", "#76675a", "#2b221b"], glow: "112,98,86", facet: "rgba(255,245,230,.4)" },
  ketu: { size: 0.028, fill: ["#f1e6a0", "#a99a32", "#48400c"], glow: "176,160,60", facet: "", round: true, eye: true },
};
/** The order of the planet buttons (for keyboards and screen readers). */
const PRIORITY: readonly GrahaKey[] = ["sun", "moon", "jupiter", "venus", "saturn", "mars", "mercury", "rahu", "ketu"];
/**
 * Slowest to fastest by usual daily motion. When two meet, the faster one steps inwards round the
 * slower, which keeps its place; the faster one is also drawn on top. A fixed order, so nobody
 * swaps lanes halfway through a meeting when real speeds cross.
 */
const BY_SPEED: readonly GrahaKey[] = ["saturn", "rahu", "ketu", "jupiter", "mars", "sun", "venus", "mercury", "moon"];

// The twelve rashi glyphs, drawn as strokes in a 20 × 20 box centred on 0,0 (upright = outwards).
const GLYPHS = [
  // Mesha ♈
  "M0 8V-1C0-7-2.5-9-5-9S-9-6.5-8.5-4-6-1-5-1M0-1C0-7 2.5-9 5-9S9-6.5 8.5-4 6-1 5-1",
  // Vrishabha ♉
  "M-8-9C-7-4-4-2.5 0-2.5S7-4 8-9M5.2 3.5A5.2 5.2 0 1 1-5.2 3.5 5.2 5.2 0 1 1 5.2 3.5",
  // Mithuna ♊
  "M-8-8C-3-6 3-6 8-8M-8 8C-3 6 3 6 8 8M-3.2-6.4V6.4M3.2-6.4V6.4",
  // Karka ♋
  "M9-2.5C6-8.5-3-9.5-8.5-4.5M-9 2.5C-6 8.5 3 9.5 8.5 4.5M-2-3A3 3 0 1 1-8-3 3 3 0 1 1-2-3M8 3A3 3 0 1 1 2 3 3 3 0 1 1 8 3",
  // Simha ♌
  "M-1.5 4C-1.5-1-4-3-4-6-4-9.5 4.5-9.5 4.5-5 4.5-1 1.5 2 1.5 6 1.5 9 5.5 9.5 7 7M-1.5 4A3 3 0 1 1-7.5 4 3 3 0 1 1-1.5 4",
  // Kanya ♍
  "M-9-7C-8-7-7.5-6-7.5-4.5V7M-7.5-4C-7.5-8.5-2.5-8.5-2.5-4V7M-2.5-4C-2.5-8.5 2.5-8.5 2.5-4V5.5C2.5 8 4 9.5 6 9.5M2.5 1.5C5-1.5 9-1 8.5 2.5 8 6 4 8.5 0 9.5",
  // Tula ♎
  "M-9 7.5H9M-9 3H-3.5C-6.5 0-6-6.5 0-6.5S6.5 0 3.5 3H9",
  // Vrishchika ♏
  "M-9-7C-8-7-7.5-6-7.5-4.5V7M-7.5-4C-7.5-8.5-2.5-8.5-2.5-4V7M-2.5-4C-2.5-8.5 2.5-8.5 2.5-4V5C2.5 7.5 4 8.5 6 8.5H9M6.5 6 9 8.5 6.5 11",
  // Dhanu ♐
  "M-8 8 8-8M1.5-8H8V-1.5M-6.5-1.5 1.5 6.5",
  // Makara ♑
  "M-9-7H-6.5L-3 6 1-5C2-8.5 6-8.5 6-5V4C6 7.5 9.5 8.5 9.5 5 9.5 2 6.5 1.5 4.5 4S-1 9.5-3.5 8.5",
  // Kumbha ♒
  "M-9-1-5.5-5-2-1 1.5-5 5-1 8.5-5M-9 6-5.5 2-2 6 1.5 2 5 6 8.5 2",
  // Meena ♓
  "M-7-9C-2-4.5-2 4.5-7 9M7-9C2-4.5 2 4.5 7 9M-4.5 0H4.5",
] as const;

/** Faint glints that flash now and then on the rings: radius (fraction of D), angle, phase, period (s). */
const GLINTS = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const rings = [RAD.rim, RAD.scaleOut, RAD.signOut, RAD.signIn, RAD.nakOut, RAD.inner, RAD.core];
  return { d: rings[Math.floor(r(1) * rings.length)]!, a: r(2) * TAU, p: r(3) * TAU, f: 3.5 + r(4) * 4 };
});

/** Half-day samples, computed on demand and dropped once they are behind. */
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

/** Interpolated longitude between two samples (degrees, taking the short way round). */
function blend(a: GrahaSample, b: GrahaSample, f: number): number {
  let d = b.longitude - a.longitude;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a.longitude + d * f;
}

/** Canvas angle for a sidereal longitude: 0° Mesha on the left, growing anticlockwise. */
const angle = (lon: number) => Math.PI - (lon * Math.PI) / 180;

/** Angular distance between two longitudes, 0–180°. */
const apart = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

/**
 * The still part of the wheel — everything but the gems and the glints — drawn once per size on
 * an off-screen canvas, then turned and stamped every frame. Each line is laid twice, a pale
 * line a hair below-right of a gold one, so it reads as engraved.
 */
function paintWheel(side: number, dpr: number): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = Math.round(side * dpr);
  layer.height = Math.round(side * dpr);
  const ctx = layer.getContext("2d");
  if (!ctx) return layer;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = side / 2;
  const D = side / 2;
  const hair = Math.max(0.9, D / 220);

  // Warm wash behind the centre, inside the rosette.
  const wash = ctx.createRadialGradient(c, c, 0, c, c, RAD.inner * D);
  wash.addColorStop(0, "rgba(255,226,150,.38)");
  wash.addColorStop(1, "rgba(255,226,150,0)");
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(c, c, RAD.inner * D, 0, TAU);
  ctx.fill();
  // A faint gold tint in the sign band, so the rashi sit on a band of their own.
  ctx.strokeStyle = "rgba(226,176,58,.16)";
  ctx.lineWidth = (RAD.signOut - RAD.signIn) * D;
  ctx.beginPath();
  ctx.arc(c, c, ((RAD.signOut + RAD.signIn) / 2) * D, 0, TAU);
  ctx.stroke();

  const metal = ctx.createLinearGradient(0, 0, side, side);
  metal.addColorStop(0, "#8a580a");
  metal.addColorStop(0.28, "#b98420");
  metal.addColorStop(0.5, "#9c6912");
  metal.addColorStop(0.72, "#c4902a");
  metal.addColorStop(1, "#7d4f08");

  const lines = (ink: string | CanvasGradient, dx: number) => {
    ctx.save();
    ctx.translate(dx, dx);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ring = (f: number, w = 1) => {
      ctx.lineWidth = hair * w;
      ctx.beginPath();
      ctx.arc(c, c, f * D, 0, TAU);
      ctx.stroke();
    };
    const spoke = (deg: number, from: number, to: number) => {
      const t = angle(deg);
      ctx.moveTo(c + from * D * Math.cos(t), c + from * D * Math.sin(t));
      ctx.lineTo(c + to * D * Math.cos(t), c + to * D * Math.sin(t));
    };

    // Rim: a fine outer line, a row of beads, and the scale's edge.
    ring(RAD.rim, 1.1);
    for (let d = 0; d < 360; d += 5) {
      const t = angle(d + 2.5);
      ctx.beginPath();
      ctx.arc(c + RAD.beads * D * Math.cos(t), c + RAD.beads * D * Math.sin(t), Math.max(0.7, D * (d % 30 === 25 ? 0.0065 : 0.0042)), 0, TAU);
      ctx.fill();
    }
    ring(RAD.scaleOut, 1.3);

    // Degree scale: every degree, every five, and the sign boundaries right across the band.
    const span = RAD.scaleOut - RAD.signOut;
    ctx.lineWidth = hair * 0.6;
    ctx.beginPath();
    for (let d = 0; d < 360; d++) if (d % 5) spoke(d, RAD.scaleOut, RAD.scaleOut - span * 0.28);
    ctx.stroke();
    ctx.lineWidth = hair * 0.9;
    ctx.beginPath();
    for (let d = 5; d < 360; d += 5) if (d % 30) spoke(d, RAD.scaleOut, RAD.scaleOut - span * (d % 10 ? 0.5 : 0.62));
    ctx.stroke();
    ring(RAD.signOut, 1.2);
    ring(RAD.signIn, 1.2);
    ctx.lineWidth = hair * 1.1;
    ctx.beginPath();
    for (let d = 0; d < 360; d += 30) spoke(d, RAD.scaleOut, RAD.signIn);
    ctx.stroke();

    // The rashi glyphs, upright facing outwards.
    const g = (D * 0.074) / 20;
    for (let i = 0; i < 12; i++) {
      const t = angle(i * 30 + 15);
      ctx.save();
      ctx.translate(c + RAD.glyph * D * Math.cos(t), c + RAD.glyph * D * Math.sin(t));
      ctx.rotate(t + Math.PI / 2);
      ctx.scale(g, g);
      ctx.lineWidth = Math.max(1.5, (hair * 1.25) / g);
      ctx.stroke(new Path2D(GLYPHS[i]));
      ctx.restore();
      // Small diamonds either side of each glyph.
      for (const side of [-1, 1]) {
        const tt = angle(i * 30 + 15 + side * 9.5);
        const x = c + RAD.glyph * D * Math.cos(tt);
        const y = c + RAD.glyph * D * Math.sin(tt);
        const s = Math.max(1, D * 0.008);
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s * 0.6, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s * 0.6, y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Filigree: a row of small scallops hanging inside the sign band, with a dot in each.
    const n = 72;
    const sr = (TAU * RAD.signIn * D) / n / 2;
    ctx.lineWidth = hair * 0.8;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const x = c + RAD.signIn * D * Math.cos(t);
      const y = c + RAD.signIn * D * Math.sin(t);
      ctx.moveTo(x + sr * Math.cos(t + Math.PI / 2), y + sr * Math.sin(t + Math.PI / 2));
      ctx.arc(x, y, sr, t + Math.PI / 2, t + (Math.PI * 3) / 2);
    }
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * TAU;
      const r = RAD.signIn * D - sr * 0.9;
      ctx.beginPath();
      ctx.arc(c + r * Math.cos(t), c + r * Math.sin(t), Math.max(0.5, D * 0.0028), 0, TAU);
      ctx.fill();
    }

    // The gem track: a fine double line.
    ring(RAD.track + 0.006, 0.7);
    ring(RAD.track - 0.006, 0.7);

    // Nakshatras: twenty-seven points between two rings, with a fine line at each boundary.
    ring(RAD.nakOut, 1);
    ring(RAD.nakIn, 1);
    ctx.lineWidth = hair * 0.7;
    ctx.beginPath();
    for (let i = 0; i < 27; i++) spoke(i * (360 / 27), RAD.nakOut, RAD.nakIn);
    ctx.stroke();
    for (let i = 0; i < 27; i++) {
      const t = angle((i + 0.5) * (360 / 27));
      ctx.beginPath();
      ctx.arc(c + RAD.nakDot * D * Math.cos(t), c + RAD.nakDot * D * Math.sin(t), Math.max(0.9, D * 0.0058), 0, TAU);
      ctx.fill();
    }

    // Rosette: a dotted ring, twelve long petals and twelve short ones between them.
    for (let i = 0; i < 120; i++) {
      const t = (i / 120) * TAU;
      ctx.beginPath();
      ctx.arc(c + RAD.inner * D * Math.cos(t), c + RAD.inner * D * Math.sin(t), Math.max(0.5, D * 0.0026), 0, TAU);
      ctx.fill();
    }
    const petal = (t: number, from: number, to: number, width: number) => {
      const x0 = c + from * D * Math.cos(t);
      const y0 = c + from * D * Math.sin(t);
      const x1 = c + to * D * Math.cos(t);
      const y1 = c + to * D * Math.sin(t);
      const m = ((from + to) / 2) * D;
      const w = width * D;
      const nx = -Math.sin(t);
      const ny = Math.cos(t);
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(c + m * Math.cos(t) + nx * w, c + m * Math.sin(t) + ny * w, x1, y1);
      ctx.quadraticCurveTo(c + m * Math.cos(t) - nx * w, c + m * Math.sin(t) - ny * w, x0, y0);
    };
    ctx.lineWidth = hair * 0.9;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) petal((i / 12) * TAU, RAD.core, RAD.rosette, 0.075);
    ctx.stroke();
    ctx.lineWidth = hair * 0.7;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) petal(((i + 0.5) / 12) * TAU, RAD.core, RAD.core + 0.14, 0.04);
    for (let i = 0; i < 12; i++) petal((i / 12) * TAU, RAD.core + 0.03, RAD.rosette - 0.07, 0.032);
    ctx.stroke();
    ring(RAD.core, 1.1);

    // The engraved sun: wavy rays round a small disc.
    ctx.lineWidth = hair * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * TAU;
      const from = D * 0.062;
      const to = D * (i % 2 ? 0.12 : 0.145);
      const nx = -Math.sin(t);
      const ny = Math.cos(t);
      const w = D * 0.012;
      ctx.moveTo(c + from * Math.cos(t), c + from * Math.sin(t));
      ctx.bezierCurveTo(
        c + (from + (to - from) * 0.33) * Math.cos(t) + nx * w,
        c + (from + (to - from) * 0.33) * Math.sin(t) + ny * w,
        c + (from + (to - from) * 0.66) * Math.cos(t) - nx * w,
        c + (from + (to - from) * 0.66) * Math.sin(t) - ny * w,
        c + to * Math.cos(t),
        c + to * Math.sin(t),
      );
    }
    ctx.stroke();
    ring(0.055, 1.1);
    ctx.restore();
  };

  lines("rgba(255,251,238,.9)", Math.max(0.6, hair * 0.8));
  lines(metal, 0);

  // The sun's disc, polished gold.
  const disc = ctx.createRadialGradient(c - D * 0.018, c - D * 0.02, D * 0.004, c, c, D * 0.05);
  disc.addColorStop(0, "#fff3c0");
  disc.addColorStop(0.55, "#e7b33f");
  disc.addColorStop(1, "#a86f12");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(c, c, D * 0.05, 0, TAU);
  ctx.fill();
  return layer;
}

/** A cut gem (or a pearl) in a thin gold bezel, with a glow of its own colour. */
function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, gem: Gem, turn: number, sparkle: number, big: boolean) {
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (big ? 3.6 : 2.6));
  glow.addColorStop(0, `rgba(${gem.glow},${big ? 0.5 : 0.38})`);
  glow.addColorStop(1, `rgba(${gem.glow},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * (big ? 3.6 : 2.6), 0, TAU);
  ctx.fill();

  // Bezel, with a soft shadow under it.
  ctx.save();
  ctx.shadowColor = "rgba(110,64,8,.35)";
  ctx.shadowBlur = r * 0.9;
  ctx.shadowOffsetY = r * 0.25;
  const bezel = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  bezel.addColorStop(0, "#fbe6a6");
  bezel.addColorStop(0.5, "#c58f26");
  bezel.addColorStop(1, "#8a570c");
  ctx.fillStyle = bezel;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
  body.addColorStop(0, gem.fill[0]);
  body.addColorStop(0.55, gem.fill[1]);
  body.addColorStop(1, gem.fill[2]);
  ctx.fillStyle = body;
  if (gem.round) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (gem.eye) {
      // The cat's-eye band: a bright line of light across the dome, slowly turning with the gem.
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.clip();
      ctx.translate(x, y);
      ctx.rotate(turn * 0.5 + Math.PI / 2);
      const band = ctx.createLinearGradient(-r * 0.3, 0, r * 0.3, 0);
      band.addColorStop(0, "rgba(255,252,220,0)");
      band.addColorStop(0.5, "rgba(255,252,220,.95)");
      band.addColorStop(1, "rgba(255,252,220,0)");
      ctx.fillStyle = band;
      ctx.fillRect(-r * 0.3, -r, r * 0.6, r * 2);
      ctx.restore();
    }
  } else {
    // Octagonal brilliant seen from above: girdle, table and the facets between.
    const pt = (k: number, f: number) => {
      const t = turn + (k / 8) * TAU;
      return [x + Math.cos(t) * r * f, y + Math.sin(t) * r * f] as const;
    };
    ctx.beginPath();
    for (let k = 0; k < 8; k++) ctx[k ? "lineTo" : "moveTo"](...pt(k, 1));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gem.facet;
    ctx.lineWidth = Math.max(0.5, r * 0.07);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) ctx[k ? "lineTo" : "moveTo"](...pt(k + 0.5, 0.5));
    ctx.closePath();
    for (let k = 0; k < 8; k++) {
      ctx.moveTo(...pt(k + 0.5, 0.5));
      ctx.lineTo(...pt(k, 1));
      ctx.moveTo(...pt(k + 0.5, 0.5));
      ctx.lineTo(...pt(k + 1, 1));
    }
    ctx.stroke();
  }
  // Specular highlight.
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.4, r * 0.24, r * 0.14, -0.7, 0, TAU);
  ctx.fill();
  if (sparkle > 0.02) star(ctx, x + r * 0.42, y - r * 0.42, r * (0.6 + sparkle * 0.9), sparkle);
}

/** A four-pointed glint. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  ctx.fillStyle = `rgba(255,253,240,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** Gems closer than this in the sky (degrees) are joined by a faint gold line, full by LINK_FULL. */
const LINK_DEG = 16;
const LINK_FULL = 8;
/** How far the wheel tilts towards the mouse at most (degrees), and the depth it tilts in (px). */
const TILT_DEG = 6;
const PERSPECTIVE = 1100;
const RADIAN = Math.PI / 180;

/** Trails show where a gem was this many sky days ago, at most TRAIL_MAX_DEG long. */
const TRAIL_DAYS = 1.6;
const TRAIL_MAX_DEG = 24;
/** Seconds a sign-entry ripple lasts. */
const RIPPLE_S = 1.6;

/** What the drawing remembers between frames: each graha's sign, and the ripples still showing. */
interface Effects {
  sign: Partial<Record<GrahaKey, number>>;
  ripples: { key: GrahaKey; sign: number; at: number }[];
}

/** Where a gem was last drawn (canvas pixels) and what it stands for. */
interface GemSpot {
  key: GrahaKey;
  x: number;
  y: number;
  r: number;
  lon: number;
  retro: boolean;
}

/** 0 → 1 with soft ends. */
const ease = (w: number) => {
  const v = Math.min(1, Math.max(0, w));
  return v * v * (3 - 2 * v);
};

function draw(
  ctx: CanvasRenderingContext2D,
  side: number,
  layer: HTMLCanvasElement,
  cache: SkyCache,
  day: number,
  spin: number,
  clock: number,
  focus: GrahaKey | null,
  focusLevel: number,
  fx: Effects,
): GemSpot[] {
  ctx.clearRect(0, 0, side, side);
  const c = side / 2;
  const D = side / 2;
  const hair = Math.max(0.9, D / 220);

  // The sun-glow at the centre, breathing slowly.
  const breathe = 0.5 + 0.5 * Math.sin(clock * 0.6);
  const halo = ctx.createRadialGradient(c, c, 0, c, c, D * (0.3 + 0.03 * breathe));
  halo.addColorStop(0, `rgba(255,214,110,${(0.55 + 0.15 * breathe).toFixed(3)})`);
  halo.addColorStop(0.45, "rgba(255,206,100,.22)");
  halo.addColorStop(1, "rgba(255,206,100,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(c, c, D * 0.36, 0, TAU);
  ctx.fill();

  // Soft rays turning slowly round the sun, the other way to the wheel.
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(clock * 0.045);
  const rays = ctx.createRadialGradient(0, 0, D * 0.05, 0, 0, D * 0.4);
  rays.addColorStop(0, `rgba(250,190,70,${(0.42 + 0.14 * breathe).toFixed(3)})`);
  rays.addColorStop(1, "rgba(255,205,96,0)");
  ctx.fillStyle = rays;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * TAU;
    const reach = D * (i % 2 ? 0.27 : 0.4);
    const w = 0.07;
    ctx.moveTo(Math.cos(t - w) * D * 0.06, Math.sin(t - w) * D * 0.06);
    ctx.lineTo(Math.cos(t) * reach, Math.sin(t) * reach);
    ctx.lineTo(Math.cos(t + w) * D * 0.06, Math.sin(t + w) * D * 0.06);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  // The wheel, turned.
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(spin);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(layer, -c, -c, side, side);
  ctx.restore();

  // Glints flashing on the rings, turning with the wheel.
  for (const g of GLINTS) {
    const a = Math.sin(clock * (TAU / g.f) + g.p);
    if (a < 0.86) continue;
    const k = (a - 0.86) / 0.14;
    const t = g.a + spin;
    star(ctx, c + g.d * D * Math.cos(t), c + g.d * D * Math.sin(t), D * 0.03 * k, 0.95 * k);
  }

  // Where the grahas are at `day`, and which way each is moving.
  const i0 = Math.floor(day / STEP_DAYS);
  const f = day / STEP_DAYS - i0;
  const now = cache.at(i0);
  const next = cache.at(i0 + 1);
  const lon = Object.fromEntries(GRAHA_KEYS.map((k) => [k, blend(now[k], next[k], f)])) as Record<GrahaKey, number>;
  const retro = (k: GrahaKey) => {
    let d = next[k].longitude - now[k].longitude;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d < 0;
  };

  // A faster gem coming up to a slower one swings inwards smoothly round it; the slower one stays.
  const lane = {} as Record<GrahaKey, number>;
  for (const [i, k] of BY_SPEED.entries()) {
    let l = 0;
    for (const j of BY_SPEED.slice(0, i)) {
      const w = Math.min(1, Math.max(0, (CLEAR_DEG - apart(lon[k], lon[j])) / (CLEAR_DEG - FULL_DEG)));
      l = Math.max(l, (lane[j]! + 1) * (w * w * (3 - 2 * w)));
    }
    lane[k] = Math.min(l, 2);
  }

  const spots = {} as Record<GrahaKey, GemSpot>;
  const orbit = {} as Record<GrahaKey, number>;
  for (const k of BY_SPEED) {
    const t = angle(lon[k]) + spin;
    const rr = (RAD.track - lane[k] * LANE) * D;
    orbit[k] = rr;
    spots[k] = { key: k, x: c + rr * Math.cos(t), y: c + rr * Math.sin(t), r: Math.max(3.5, GEMS[k].size * D * 1.15), lon: lon[k], retro: retro(k) };
  }

  // A graha entering a new rashi: a ripple from the gem, and that sign's band lights for a moment.
  for (const k of GRAHA_KEYS) {
    const sign = Math.floor((((lon[k] % 360) + 360) % 360) / 30);
    const was = fx.sign[k];
    fx.sign[k] = sign;
    if (was !== undefined && was !== sign) fx.ripples.push({ key: k, sign, at: clock });
  }
  fx.ripples = fx.ripples.filter((p) => clock - p.at < RIPPLE_S);
  for (const p of fx.ripples) {
    const a = (1 - (clock - p.at) / RIPPLE_S) ** 2;
    ctx.save();
    ctx.strokeStyle = `rgba(255,208,110,${(0.42 * a).toFixed(3)})`;
    ctx.lineWidth = (RAD.signOut - RAD.signIn) * D * 0.94;
    ctx.beginPath();
    // Canvas angles grow clockwise and longitudes anticlockwise, so the sign runs from its end to its start.
    ctx.arc(c, c, ((RAD.signOut + RAD.signIn) / 2) * D, angle(p.sign * 30 + 30) + spin, angle(p.sign * 30) + spin);
    ctx.stroke();
    ctx.restore();
  }

  // Conjunctions: a faint gold line between grahas close together in the sky, fading in as they
  // meet and out as they part, with a small glint halfway. Gems that have stepped right up to
  // each other leave no room for a straight line, so there it bows out to the side as a small arc.
  // Three or more together are joined as a chain, nearest pairs first (a spanning tree), not
  // every one to every other.
  const pairs: [GrahaKey, GrahaKey, number][] = [];
  for (const [i, a] of GRAHA_KEYS.entries()) {
    for (const b of GRAHA_KEYS.slice(i + 1)) {
      const d = apart(lon[a], lon[b]);
      if (d < LINK_DEG) pairs.push([a, b, d]);
    }
  }
  pairs.sort((p, q) => p[2] - q[2]);
  const group = Object.fromEntries(GRAHA_KEYS.map((k) => [k, k])) as Record<GrahaKey, GrahaKey>;
  const root = (k: GrahaKey): GrahaKey => (group[k] === k ? k : (group[k] = root(group[k])));
  ctx.save();
  ctx.lineCap = "round";
  for (const [a, b, d] of pairs) {
    if (root(a) === root(b)) continue;
    group[root(a)] = root(b);
    const w = ease((LINK_DEG - d) / (LINK_DEG - LINK_FULL));
    if (w < 0.01) continue;
    const A = spots[a];
    const B = spots[b];
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    let mx = (A.x + B.x) / 2;
    let my = (A.y + B.y) / 2;
    const room = len - 1.3 * (A.r + B.r);
    const want = D * 0.06;
    if (room < want) {
      // Bow away from the centre (and, for gems stacked straight inwards, always the same way round).
      let nx = -(B.y - A.y) / len;
      let ny = (B.x - A.x) / len;
      const ox = mx - c;
      const oy = my - c;
      if (nx * (ox - oy * 0.6) + ny * (oy + ox * 0.6) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const bow = (A.r + B.r) * 1.6 * (1 - Math.max(0, room) / want);
      mx += nx * bow;
      my += ny * bow;
    }
    // Each end leaves its gem's bezel heading for the bend.
    const end = (s: GemSpot) => {
      const d = Math.hypot(mx - s.x, my - s.y) || 1;
      return [s.x + ((mx - s.x) / d) * s.r * 1.3, s.y + ((my - s.y) / d) * s.r * 1.3] as const;
    };
    const [x0, y0] = end(A);
    const [x1, y1] = end(B);
    // The control point that makes the curve pass through (mx, my) halfway.
    const qx = 2 * mx - (x0 + x1) / 2;
    const qy = 2 * my - (y0 + y1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(room < want ? qx : (x0 + x1) / 2, room < want ? qy : (y0 + y1) / 2, x1, y1);
    ctx.strokeStyle = `rgba(255,224,150,${(0.6 * w).toFixed(3)})`;
    ctx.lineWidth = hair * 3.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(150,96,12,${(0.75 * w).toFixed(3)})`;
    ctx.lineWidth = hair * 1.05;
    ctx.stroke();
    star(ctx, room < want ? mx : (x0 + x1) / 2, room < want ? my : (y0 + y1) / 2, D * 0.016 * w, 0.95 * w);
  }
  ctx.restore();

  // Trails: a fading ribbon of the gem's own colour along the way it came, as long as its speed.
  ctx.save();
  ctx.lineCap = "round";
  for (const k of BY_SPEED) {
    let perDay = next[k].longitude - now[k].longitude;
    if (perDay > 180) perDay -= 360;
    if (perDay < -180) perDay += 360;
    perDay /= STEP_DAYS;
    const length = Math.min(TRAIL_MAX_DEG, Math.abs(perDay) * TRAIL_DAYS);
    if (length < 1.2) continue;
    const back = perDay < 0 ? 1 : -1; // where it came from
    const steps = 18;
    for (let n = 0; n < steps; n++) {
      const a0 = angle(lon[k] + back * length * (n / steps)) + spin;
      const a1 = angle(lon[k] + back * length * ((n + 1) / steps)) + spin;
      const fade = (1 - n / steps) ** 1.4;
      ctx.beginPath();
      ctx.arc(c, c, orbit[k], Math.min(a0, a1), Math.max(a0, a1));
      // A soft glow of the gem's colour, and a finer core in its deeper edge colour (so even
      // the pale pearl and diamond leave a trail that shows on the cream).
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${GEMS[k].glow},${(0.5 * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, spots[k].r * 1.7 * fade);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = GEMS[k].fill[2];
      ctx.lineWidth = Math.max(0.8, spots[k].r * 0.6 * fade);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Slowest first, so a faster gem passing by sits on top.
  for (const [i, k] of BY_SPEED.entries()) {
    const s = spots[k];
    const sparkle = Math.max(0, Math.sin(clock * 0.9 + i * 1.7)) ** 12;
    drawGem(ctx, s.x, s.y, s.r, GEMS[k], angle(s.lon) + spin, sparkle, k === "sun");
    if (k === "moon") moonPhase(ctx, s, spots.sun, apart(lon.moon, lon.sun));
  }

  // The ripple round a gem that has just entered a new sign.
  for (const p of fx.ripples) {
    const s = spots[p.key];
    const age = (clock - p.at) / RIPPLE_S;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * (1.4 + age * 3.2), 0, TAU);
    ctx.strokeStyle = `rgba(${GEMS[p.key].glow},${(0.7 * (1 - age) ** 1.5).toFixed(3)})`;
    ctx.lineWidth = hair * (2.4 - age * 1.6);
    ctx.stroke();
  }

  // A fine gold ring round the gem being looked at (hovered, tapped or reached by keyboard).
  if (focus && focusLevel > 0.01) {
    const s = spots[focus];
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 1.75, 0, TAU);
    ctx.strokeStyle = `rgba(255,246,214,${(0.95 * focusLevel).toFixed(3)})`;
    ctx.lineWidth = hair * 3.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(146,88,6,${(0.95 * focusLevel).toFixed(3)})`;
    ctx.lineWidth = hair * 1.3;
    ctx.stroke();
  }

  cache.prune(i0 - 2);
  // Top-most first, for hit-testing.
  return [...BY_SPEED].reverse().map((k) => spots[k]);
}

/**
 * The Moon's real phase on its pearl: the side away from the Sun gem in soft shadow, the
 * terminator an ellipse — a thin crescent near new moon, nothing at full.
 */
function moonPhase(ctx: CanvasRenderingContext2D, moon: GemSpot, sun: GemSpot, elongation: number) {
  const p = (elongation * Math.PI) / 180; // 0 new … π full
  if (p > Math.PI - 0.08) return; // full: all lit
  const r = moon.r * 0.98;
  const bulge = r * Math.abs(Math.cos(p));
  ctx.save();
  ctx.translate(moon.x, moon.y);
  // Local +x points at the Sun: that side is lit.
  ctx.rotate(Math.atan2(sun.y - moon.y, sun.x - moon.x));
  ctx.beginPath();
  // The dark half, away from the Sun…
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true);
  // …closed by the terminator: into the lit half before first quarter, into the dark half after.
  ctx.ellipse(0, 0, Math.max(0.01, bulge), r, 0, Math.PI / 2, -Math.PI / 2, p < Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(84,72,112,.52)";
  ctx.fill();
  ctx.restore();
}

/** What the card beside a gem says. */
interface Tip {
  key: GrahaKey;
  title: string;
  place: string;
  nakshatra: string;
  retro: boolean;
}

function tipFor(s: GemSpot): Tip {
  const n = GRAHA_NAMES[s.key];
  const p = placeOf(s.lon);
  // The nodes are best known by their Sanskrit names.
  const node = s.key === "rahu" || s.key === "ketu";
  return {
    key: s.key,
    title: node ? `${n.sa} · ${n.en}` : `${n.en} · ${n.sa}`,
    place: `in ${p.rashi} ${p.degree}°`,
    nakshatra: `${p.nakshatra} nakshatra`,
    retro: s.retro,
  };
}

type Source = "pointer" | "touch" | "key";

/** What the component can ask of the animation loop. */
interface Control {
  update: () => void;
  show: (key: GrahaKey | null, source: Source) => void;
  place: () => void;
  source: () => Source | null;
}

/**
 * The wheel (size it with `className`, which sets its width; it stays square) with, under it, a
 * one-line caption.
 *
 * Hover a gem (tap it on a touch screen, or Tab to the planets and use the arrow keys) for a
 * small card: the graha, its rashi and degree, its nakshatra, and whether it is retrograde; the
 * time-lapse eases to a stop while the card is open. With a mouse, the wheel tilts a little to
 * face it.
 */
export default function HeroSky({ className = "" }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const tipId = useId();
  // null until mounted: the server cannot know the visitor's clock.
  const [skyDate, setSkyDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  // The planet button that Tab lands on (the others are reached with the arrow keys).
  const [rove, setRove] = useState(0);
  // Lets the buttons and the tooltip reach the animation loop.
  const controlRef = useRef<Control | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const tiltEl = tiltRef.current;
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !tiltEl || !box || !canvas || !ctx) return;

    const start = Date.now();
    const cache = new SkyCache(start);
    let day = 0; // sky days since `start`
    let turn = 0; // seconds of the wheel's turning (slows with the time-lapse)
    let clock = 0; // real seconds of motion (glints, breathing)
    let side = 0;
    let layer: HTMLCanvasElement | null = null;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let shownDate = "";
    let spots: GemSpot[] = [];
    // The gem being looked at, and how: a hover follows the mouse, a tap stays until the next tap.
    let active: { key: GrahaKey; source: Source } | null = null;
    let ringKey: GrahaKey | null = null;
    let ring = 0; // strength of the ring round it, eased
    let speed = 1; // the time-lapse eases to a stop while a gem is shown, so the card can be read
    let shownTip = "";
    const fx: Effects = { sign: {}, ripples: [] };
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }; // rotateX / rotateY now and wanted (degrees)
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const zone = stage.closest("section") ?? document.body;

    const dateText = () =>
      new Date(start + day * DAY_MS).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

    /** A spot as it appears on screen with the tilt, relative to the stage. */
    const project = (s: GemSpot) => {
      const u = s.x - side / 2;
      const v = s.y - side / 2;
      const ax = tilt.x * RADIAN;
      const ay = tilt.y * RADIAN;
      const x1 = u * Math.cos(ay);
      const z1 = -u * Math.sin(ay);
      const y2 = v * Math.cos(ax) - z1 * Math.sin(ax);
      const z2 = v * Math.sin(ax) + z1 * Math.cos(ax);
      const k = PERSPECTIVE / (PERSPECTIVE - z2);
      return { x: side / 2 + x1 * k, y: side / 2 + y2 * k, r: s.r * k };
    };

    /** The gem under a point on screen, if any (`slop`: extra reach for fingers). */
    const hit = (clientX: number, clientY: number, slop: number): GrahaKey | null => {
      const rect = stage.getBoundingClientRect();
      let best: GrahaKey | null = null;
      let bestD = Infinity;
      for (const s of spots) {
        const q = project(s);
        const d = Math.hypot(clientX - rect.left - q.x, clientY - rect.top - q.y);
        if (d <= Math.max(q.r * 1.3 + 3, slop) && d < bestD) {
          best = s.key;
          bestD = d;
        }
      }
      return best;
    };

    const spotOf = (key: GrahaKey) => spots.find((p) => p.key === key);

    const refreshTip = () => {
      const s = active && spotOf(active.key);
      const next = s ? tipFor(s) : null;
      const text = next ? JSON.stringify(next) : "";
      if (text !== shownTip) {
        shownTip = text;
        setTip(next);
      }
    };

    /** Sets the card beside its gem, inside what can be seen of the hero and the window. */
    const place = () => {
      const el = tipRef.current;
      const s = active && spotOf(active.key);
      if (!el || !s) return;
      const q = project(s);
      const rect = stage.getBoundingClientRect();
      const area = zone.getBoundingClientRect();
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const minX = Math.max(area.left, 0) + 8 - rect.left;
      const maxX = Math.min(area.right, document.documentElement.clientWidth) - 8 - w - rect.left;
      const left = Math.max(minX, Math.min(maxX, q.x - w / 2));
      let top = q.y - q.r * 1.75 - h - 6;
      const below = rect.top + top < Math.max(area.top, header, 0) + 8;
      if (below) top = q.y + q.r * 1.75 + 6;
      el.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`;
      el.style.setProperty("--arrow", `${Math.max(14, Math.min(w - 14, q.x - left)).toFixed(1)}px`);
      el.dataset.side = below ? "below" : "above";
    };

    const applyTilt = () => {
      tiltEl.style.transform = tilt.x || tilt.y ? `perspective(${PERSPECTIVE}px) rotateX(${tilt.x.toFixed(3)}deg) rotateY(${tilt.y.toFixed(3)}deg)` : "";
      const shine = shineRef.current;
      if (shine) {
        // A soft light on the side turned towards the mouse.
        shine.style.opacity = Math.min(1, Math.hypot(tilt.x, tilt.y) / TILT_DEG).toFixed(3);
        shine.style.setProperty("--hx", `${(50 + (tilt.y / TILT_DEG) * 30).toFixed(1)}%`);
        shine.style.setProperty("--hy", `${(50 - (tilt.x / TILT_DEG) * 30).toFixed(1)}%`);
      }
    };

    const paint = () => {
      if (side < 24 || !layer) return; // not laid out yet
      spots = draw(ctx, side, layer, cache, day, -(turn * TAU) / TURN_SECONDS, clock, ringKey, ring, fx);
      refreshTip();
      place();
      const text = dateText();
      if (text !== shownDate) {
        shownDate = text;
        setSkyDate(text);
      }
    };

    const show = (key: GrahaKey | null, source: Source) => {
      active = key ? { key, source } : null;
      if (key) ringKey = key;
      // Still (off screen): no loop to ease the ring in, so set it and draw once.
      if (!raf) {
        ring = key ? 1 : 0;
        paint();
      } else {
        refreshTip();
        place();
      }
    };

    const resize = () => {
      const rect = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const next = Math.min(rect.width, rect.height);
      if (next < 24) return;
      if (next !== side || !layer) {
        side = next;
        canvas.width = Math.round(side * dpr);
        canvas.height = Math.round(side * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layer = paintWheel(side, dpr);
      }
      paint();
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = t;
      const dt = t - last;
      if (dt < FRAME_MS) return;
      last = t;
      const sec = Math.min(dt, 100) / 1000; // no leap after the tab was away
      speed += ((active ? 0 : 1) - speed) * Math.min(1, sec * 5);
      ring += ((active ? 1 : 0) - ring) * Math.min(1, sec * 9);
      day += sec * DAYS_PER_SECOND * speed;
      turn += sec * speed;
      clock += sec;
      const k = Math.min(1, sec * 6);
      tilt.x += (tilt.tx - tilt.x) * k;
      tilt.y += (tilt.ty - tilt.y) * k;
      if (!tilt.tx && !tilt.ty && Math.abs(tilt.x) < 0.005 && Math.abs(tilt.y) < 0.005) tilt.x = tilt.y = 0;
      applyTilt();
      paint();
    };

    const shouldRun = () => onScreen && document.visibilityState === "visible";
    const update = () => {
      if (shouldRun()) {
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
        return;
      }
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Mouse: hovering a gem shows its card.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const key = hit(e.clientX, e.clientY, 6);
      if (key) {
        if (active?.key !== key) show(key, "pointer");
      } else if (active?.source === "pointer") show(null, "pointer");
      stage.style.cursor = key ? "pointer" : "";
    };
    const onLeave = () => {
      if (active?.source === "pointer") show(null, "pointer");
      stage.style.cursor = "";
    };
    // Touch: a tap on a gem shows its card until the next tap (on it again, or anywhere else).
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10;
      down = null;
      if (moved) return;
      const key = hit(e.clientX, e.clientY, 22);
      show(key && key !== active?.key ? key : null, "touch");
    };
    const onOutside = (e: PointerEvent) => {
      if (active?.source === "touch" && !stage.contains(e.target as Node)) show(null, "touch");
    };
    // The tilt: the wheel turns a little to face the mouse while it is over the hero.
    const onZoneMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches) return;
      const r = stage.getBoundingClientRect();
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      tilt.ty = clamp((e.clientX - (r.left + r.width / 2)) / Math.max(320, window.innerWidth * 0.5)) * TILT_DEG;
      tilt.tx = -clamp((e.clientY - (r.top + r.height / 2)) / Math.max(240, window.innerHeight * 0.5)) * TILT_DEG;
    };
    const onZoneLeave = () => {
      tilt.tx = tilt.ty = 0;
    };
    const onScroll = () => {
      if (active) place();
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointerup", onUp);
    document.addEventListener("pointerdown", onOutside);
    zone.addEventListener("pointermove", onZoneMove);
    zone.addEventListener("pointerleave", onZoneLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      update();
    });
    io.observe(stage);
    document.addEventListener("visibilitychange", update);

    resize();
    setReady(true);
    controlRef.current = { update, show, place, source: () => active?.source ?? null };
    update();

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerdown", onOutside);
      zone.removeEventListener("pointermove", onZoneMove);
      zone.removeEventListener("pointerleave", onZoneLeave);
      window.removeEventListener("scroll", onScroll);
      controlRef.current = null;
    };
  }, []);

  // The card has just appeared (or has new words): set it beside its gem before it is seen.
  useLayoutEffect(() => {
    if (tip) controlRef.current?.place();
  }, [tip]);

  // Keyboard: one Tab stop for the nine planets, arrow keys between them, Escape hides the card.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = PRIORITY.length;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % n
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i + n - 1) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (to >= 0) {
      e.preventDefault();
      setRove(to);
      buttonsRef.current[to]?.focus();
    } else if (e.key === "Escape") {
      controlRef.current?.show(null, "key");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      controlRef.current?.show(PRIORITY[i]!, "key");
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div ref={stageRef} className="relative aspect-square w-full">
        {/* A soft warm light behind the wheel; the wheel itself is drawn on the canvas. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(255,250,232,.95)_0%,rgba(255,244,214,.7)_42%,rgba(255,238,200,0)_70%)]"
        />
        <div ref={tiltRef} aria-hidden="true" className="absolute inset-0 will-change-transform">
          <div ref={boxRef} className="absolute inset-0">
            <canvas ref={canvasRef} className={`size-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`} />
          </div>
          {/* The light on the side turned towards the mouse (only while tilted). */}
          <span
            ref={shineRef}
            className="pointer-events-none absolute inset-[2.5%] rounded-full opacity-0 mix-blend-soft-light"
            style={{ background: "radial-gradient(circle at var(--hx,50%) var(--hy,50%), rgba(255,255,255,.9), rgba(255,255,255,0) 58%)" }}
          />
        </div>

        {/* The planets for keyboards and screen readers: each shows the same card as a hover. */}
        <div role="group" aria-label="Planets on the zodiac wheel" className="sr-only">
          {PRIORITY.map((k, i) => (
            <button
              key={k}
              ref={(el) => {
                buttonsRef.current[i] = el;
              }}
              type="button"
              tabIndex={i === rove ? 0 : -1}
              aria-describedby={tip?.key === k ? tipId : undefined}
              onFocus={() => {
                setRove(i);
                controlRef.current?.show(k, "key");
              }}
              onBlur={() => {
                if (controlRef.current?.source() === "key") controlRef.current.show(null, "key");
              }}
              onKeyDown={(e) => onKey(e, i)}
            >
              {GRAHA_NAMES[k].en} ({GRAHA_NAMES[k].sa})
            </button>
          ))}
        </div>

        {tip && (
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="az-sky-tip pointer-events-none absolute left-0 top-0 z-10 w-max min-w-[150px] max-w-[220px] rounded-[14px] border border-[#ecd29a] bg-[#fffdf8]/95 px-3.5 pb-2.5 pt-2 text-left shadow-[0_14px_34px_rgba(90,62,40,.2)] backdrop-blur-sm"
          >
            <b className="block font-name text-[14.5px] font-bold leading-snug tracking-[-.01em] text-plum">{tip.title}</b>
            <span className="mt-0.5 block text-[12.5px] font-semibold tabular-nums text-amber-900">{tip.place}</span>
            <span className="block text-[12px] text-stone-600">{tip.nakshatra}</span>
            {tip.retro && (
              <span className="mt-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-amber-100 px-2 text-[10.5px] font-bold uppercase tracking-[.06em] text-amber-800">
                <span aria-hidden="true">℞</span> Retrograde
              </span>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-center text-[12px] font-semibold text-amber-900/80 sm:mt-5">
        {/* On phones the date goes to a second line. */}
        <span className="max-sm:basis-full">The real sky, in time-lapse</span>
        {/* Its own piece, so on a narrow screen it wraps whole; fixed width so nothing shifts as it changes. */}
        {skyDate && (
          <span className="inline-block min-w-[12ch] whitespace-nowrap tabular-nums">
            <span className="mr-1.5 max-sm:hidden">·</span>
            {skyDate}
          </span>
        )}
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

/** Shooting stars: one every SHOOT_MIN–SHOOT_MAX ms, at random. */
const SHOOT_MIN = 6000;
const SHOOT_MAX = 14000;

interface Streak {
  x: number;
  y: number;
  /** Unit direction of travel. */
  dx: number;
  dy: number;
  /** Distance the head travels, and the longest the tail gets (px). */
  run: number;
  tail: number;
  born: number;
  /** Milliseconds from first light to gone. */
  life: number;
}

/**
 * Now and then a shooting star — a fine gold-and-white streak — crosses the hero behind the
 * wheel and the text. Fill the hero with it (`className`, e.g. "absolute inset-0"). It never
 * crosses anything in the hero marked `data-sky-avoid` (the headline and the lead), so the words
 * stay clear. Like the wheel it plays for everyone, but only while the hero is on screen and the
 * tab is visible; it draws nothing at all between stars.
 */
export function ShootingStars({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    const host = canvas?.parentElement;
    if (!canvas || !ctx || !host) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let timer = 0;
    let streak: Streak | null = null;
    let onScreen = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** The words to keep clear, in canvas pixels, with a margin. */
    const keepClear = () => {
      const base = canvas.getBoundingClientRect();
      return [...host.querySelectorAll<HTMLElement>("[data-sky-avoid]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - base.left - 24, t: r.top - base.top - 24, r: r.right - base.left + 24, b: r.bottom - base.top + 24 };
      });
    };

    const schedule = (ms = SHOOT_MIN + Math.random() * (SHOOT_MAX - SHOOT_MIN)) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(launch, ms);
    };

    function launch() {
      if (!onScreen || document.visibilityState !== "visible" || w < 120 || h < 120) return schedule();
      const avoid = keepClear();
      // Try a few random paths; take the first that misses the words. None fits? Wait for the next.
      for (let attempt = 0; attempt < 24; attempt++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const slope = (14 + Math.random() * 20) * RADIAN;
        const dx = dir * Math.cos(slope);
        const dy = Math.sin(slope);
        const run = Math.min(w * 0.55, Math.max(180, w * (0.18 + Math.random() * 0.16)));
        const tail = Math.min(run * 0.6, 70 + Math.random() * 90);
        const x = w * (0.04 + Math.random() * 0.92);
        const y = h * Math.random() * 0.62;
        const endX = x + dx * run;
        const endY = y + dy * run;
        if (endX < -20 || endX > w + 20 || endY > h * 0.85) continue;
        let clear = true;
        for (let i = 0; i <= 24 && clear; i++) {
          const px = x + (dx * run * i) / 24;
          const py = y + (dy * run * i) / 24;
          clear = !avoid.some((a) => px > a.l && px < a.r && py > a.t && py < a.b);
        }
        if (!clear) continue;
        streak = { x, y, dx, dy, run, tail, born: performance.now(), life: 1000 + Math.random() * 600 };
        if (!raf) raf = requestAnimationFrame(frame);
        return;
      }
      schedule();
    }

    function frame(now: number) {
      ctx!.clearRect(0, 0, w, h);
      const s = streak;
      if (!s) {
        raf = 0;
        return;
      }
      // The first frame can carry a time stamp from just before the launch.
      const t = Math.max(0, (now - s.born) / s.life);
      if (t >= 1) {
        streak = null;
        raf = 0;
        schedule();
        return;
      }
      raf = requestAnimationFrame(frame);
      // The head races out and slows; the tail grows behind it; the whole streak brightens, then fades.
      const p = 1 - (1 - t) ** 3;
      const hx = s.x + s.dx * s.run * p;
      const hy = s.y + s.dy * s.run * p;
      const len = Math.min(s.tail, s.run * p) * (1 - 0.5 * t);
      const tx = hx - s.dx * len;
      const ty = hy - s.dy * len;
      const a = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
      const c = ctx!;
      c.lineCap = "round";
      // On the cream page a white streak alone would vanish: a warm gold body, a pale core.
      const glow = c.createLinearGradient(tx, ty, hx, hy);
      glow.addColorStop(0, "rgba(214,146,30,0)");
      glow.addColorStop(1, `rgba(214,146,30,${(0.42 * a).toFixed(3)})`);
      c.strokeStyle = glow;
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(tx, ty);
      c.lineTo(hx, hy);
      c.stroke();
      const body = c.createLinearGradient(tx, ty, hx, hy);
      body.addColorStop(0, "rgba(176,112,14,0)");
      body.addColorStop(1, `rgba(176,112,14,${(0.75 * a).toFixed(3)})`);
      c.strokeStyle = body;
      c.lineWidth = 1.8;
      c.stroke();
      const core = c.createLinearGradient(tx, ty, hx, hy);
      core.addColorStop(0.4, "rgba(255,250,232,0)");
      core.addColorStop(1, `rgba(255,255,250,${a.toFixed(3)})`);
      c.strokeStyle = core;
      c.lineWidth = 0.8;
      c.stroke();
      const head = c.createRadialGradient(hx, hy, 0, hx, hy, 6);
      head.addColorStop(0, `rgba(255,255,248,${a.toFixed(3)})`);
      head.addColorStop(0.4, `rgba(255,214,120,${(0.6 * a).toFixed(3)})`);
      head.addColorStop(1, "rgba(255,214,120,0)");
      c.fillStyle = head;
      c.beginPath();
      c.arc(hx, hy, 6, 0, TAU);
      c.fill();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);
    resize();
    // The first one comes a little sooner, so a visitor sees one early on.
    schedule(2500 + Math.random() * 3000);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
