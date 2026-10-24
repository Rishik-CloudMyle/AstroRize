// The parts of a Kundli that depend on "now": today's transits placed in the native's houses, the
// Sade Sati status and the running Yogini dasha. Worked out on every read (never stored), so a saved
// chart always shows the present sky.

import { GRAHA_NAMES, type GrahaKey } from "./constants.ts";
import { sadeSati, type SadeSati } from "./doshas.ts";
import { grahaPositions } from "./ephemeris.ts";
import { zodiacPoint, type Kundli, type ZodiacPoint } from "./kundli.ts";
import { currentYogini } from "./yogini.ts";

export interface TransitPlacement extends ZodiacPoint {
  key: GrahaKey;
  name: string;
  abbr: string;
  retrograde: boolean;
  /** Whole-sign house counted from the natal lagna and from the natal Moon sign. */
  houseFromLagna: number;
  houseFromMoon: number;
}

export interface KundliToday {
  /** The instant the transits were read (ISO). */
  at: string;
  transit: TransitPlacement[];
  sadeSati: SadeSati;
  yogini: ReturnType<typeof currentYogini>;
}

export function kundliToday(k: Kundli, at: Date): KundliToday {
  const lagnaSign = k.lagna.sign.index;
  const moonSign = k.moonSign.index;
  const transit = grahaPositions(at, k.settings.node).map((p) => {
    const point = zodiacPoint(p.longitude);
    return {
      key: p.key,
      name: GRAHA_NAMES[p.key].en,
      abbr: GRAHA_NAMES[p.key].abbr,
      ...point,
      retrograde: p.retrograde,
      houseFromLagna: ((point.sign.index - lagnaSign + 12) % 12) + 1,
      houseFromMoon: ((point.sign.index - moonSign + 12) % 12) + 1,
    };
  });
  return {
    at: at.toISOString(),
    transit,
    sadeSati: sadeSati(moonSign, at, new Date(k.birth.utc)),
    yogini: currentYogini(k.yogini, at),
  };
}
