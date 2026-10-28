"use client";

// Call sounds, made with the Web Audio API (no sound files): the astrologer's ringtone for an
// incoming consultation, and a short chime when the other side joins. Browsers keep audio blocked
// until the person has interacted with the page once; `soundState()` says whether it is, so the
// portal can offer "Enable sound", and the first click or key press anywhere unlocks it.

type Listener = () => void;

const MUTE_KEY = "astrorize.callAlerts.muted";

let ctx: AudioContext | null = null;
let unlocked = false;
let muted = readMuted();
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringGain: GainNode | null = null;
const listeners = new Set<Listener>();
let snapshot = { unlocked, muted };

function readMuted(): boolean {
  try {
    // Browser only: on the server (page rendering), Node's own experimental localStorage would warn.
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function emit() {
  snapshot = { unlocked, muted };
  listeners.forEach((l) => l());
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    ctx.onstatechange = () => {
      const now = ctx?.state === "running";
      if (now !== unlocked) {
        unlocked = now;
        emit();
      }
    };
  }
  return ctx;
}

/** Tries to start audio (works once the person has clicked or typed on the page). */
export async function unlockSound(): Promise<boolean> {
  const c = audioContext();
  if (!c) return false;
  if (c.state !== "running") {
    try {
      await c.resume();
    } catch {
      // Still blocked.
    }
  }
  const now = c.state === "running";
  if (now !== unlocked) {
    unlocked = now;
    emit();
  }
  return now;
}

let gestureHooked = false;
/** The first click, tap or key press anywhere unlocks the sound (browsers require one). */
export function unlockOnFirstGesture() {
  if (gestureHooked || typeof window === "undefined") return;
  gestureHooked = true;
  const onGesture = () => {
    void unlockSound().then((ok) => {
      if (!ok) return;
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    });
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
  // Already interacted with this page (e.g. arrived by a click in the same tab): no need to wait.
  if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) void unlockSound();
}

export function subscribeSound(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const soundState = () => snapshot;
const SERVER = { unlocked: false, muted: false };
export const serverSoundState = () => SERVER;

/** The astrologer's "mute call alerts" switch (remembered on this device). */
export function setAlertsMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: remembered for this page only.
  }
  if (ringGain && ctx) ringGain.gain.setTargetAtTime(next ? 0 : 1, ctx.currentTime, 0.02);
  emit();
}

/** One soft bell-like note: a sine with a quick attack and a gentle decay, plus a quiet octave. */
function note(c: AudioContext, out: AudioNode, freq: number, at: number, length: number, level = 0.22) {
  for (const [f, l] of [
    [freq, level],
    [freq * 2, level * 0.18],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(l, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, at + length);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** One ring: a rising three-note phrase, twice (about 1.6 s), then quiet until the next ring. */
function ringOnce(c: AudioContext, out: AudioNode) {
  const t = c.currentTime + 0.05;
  const phrase = [659.25, 830.61, 987.77]; // E5 · G#5 · B5
  for (let rep = 0; rep < 2; rep++) {
    phrase.forEach((f, i) => note(c, out, f, t + rep * 0.8 + i * 0.14, 0.5));
  }
}

const RING_EVERY_MS = 3200;

/** Starts the incoming-call ringtone (loops until stopRingtone). Silent while muted or blocked. */
export function startRingtone() {
  const c = audioContext();
  if (!c || ringTimer) return;
  ringGain = c.createGain();
  ringGain.gain.value = muted ? 0 : 1;
  ringGain.connect(c.destination);
  const out = ringGain;
  const ring = () => {
    if (c.state === "running") ringOnce(c, out);
  };
  ring();
  ringTimer = setInterval(ring, RING_EVERY_MS);
}

export function stopRingtone() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  if (ringGain) {
    try {
      ringGain.disconnect();
    } catch {
      // Already disconnected.
    }
  }
  ringGain = null;
}

/** A short two-note "connected" chime (the other side has joined). */
export function playChime() {
  const c = audioContext();
  if (!c || c.state !== "running") return;
  const t = c.currentTime + 0.03;
  note(c, c.destination, 783.99, t, 0.35, 0.18); // G5
  note(c, c.destination, 1046.5, t + 0.13, 0.6, 0.18); // C6
}
