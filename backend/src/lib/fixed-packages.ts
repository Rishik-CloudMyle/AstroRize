import { clampDiscount, configNumber, discountLimits, getSetting, putSetting } from "./settings.ts";

// The Fixed Session packages customers can buy: a length in minutes and its discount. The admin adds,
// edits and deletes them (Config → Fixed Sessions). Until the admin first saves, the original six
// packages apply, with the discounts from their old Config keys.

export interface FixedPackage {
  minutes: number;
  discount: number;
}

const ORIGINAL: ReadonlyArray<readonly [number, number]> = [
  [5, 5],
  [10, 10],
  [15, 15],
  [30, 20],
  [45, 25],
  [60, 30],
];

export const PACKAGE_MIN_MINUTES = 1;
export const PACKAGE_MAX_MINUTES = 180;
export const PACKAGE_MAX_COUNT = 12;

/** The packages as customers see them: sorted by length, each discount held inside the admin's offer range. */
export async function getPackages(): Promise<FixedPackage[]> {
  const stored = await getSetting<FixedPackage[] | null>("fixed_sessions.packages", null);
  const list: FixedPackage[] =
    Array.isArray(stored) && stored.length
      ? stored
      : await Promise.all(ORIGINAL.map(async ([m, d]) => ({ minutes: m, discount: await configNumber(`fixed_session.discount_${m}m`, d) })));
  const limits = await discountLimits();
  return list.map((p) => ({ minutes: p.minutes, discount: clampDiscount(p.discount, limits) })).sort((a, b) => a.minutes - b.minutes);
}

/** The discount of one package, or null when no such package exists (it was deleted or never offered). */
export async function packageDiscount(minutes: number): Promise<number | null> {
  const found = (await getPackages()).find((p) => p.minutes === minutes);
  return found ? found.discount : null;
}

/** Why a proposed list can't be saved, or null when it is fine. */
export async function packageProblem(list: FixedPackage[]): Promise<string | null> {
  if (!list.length) return "Keep at least one Fixed Session package — customers need something to buy.";
  if (list.length > PACKAGE_MAX_COUNT) return `At most ${PACKAGE_MAX_COUNT} packages.`;
  const seen = new Set<number>();
  const limits = await discountLimits();
  for (const p of list) {
    if (!Number.isInteger(p.minutes) || p.minutes < PACKAGE_MIN_MINUTES || p.minutes > PACKAGE_MAX_MINUTES) {
      return `A package must be ${PACKAGE_MIN_MINUTES}–${PACKAGE_MAX_MINUTES} whole minutes.`;
    }
    if (seen.has(p.minutes)) return `There are two ${p.minutes}-minute packages — each length can be offered once.`;
    seen.add(p.minutes);
    if (!Number.isInteger(p.discount) || p.discount < limits.min || p.discount > limits.max) {
      return `The ${p.minutes}-minute discount must stay within the platform offer range, ${limits.min}%–${limits.max}% (Config offers.min_discount_pct / offers.max_discount_pct).`;
    }
  }
  return null;
}

export async function savePackages(list: FixedPackage[]) {
  const clean = list.map((p) => ({ minutes: p.minutes, discount: p.discount })).sort((a, b) => a.minutes - b.minutes);
  await putSetting("fixed_sessions.packages", clean);
  return clean;
}
