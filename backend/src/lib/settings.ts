import { db } from "../db.ts";

/** Reads a numeric config value managed in the admin Config console, with a fallback. */
export async function configNumber(key: string, fallback: number): Promise<number> {
  const row = await db.configKey.findUnique({ where: { key }, select: { value: true } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The platform-wide discount range (percent) set by the admin: campaigns, Fixed Session packages
 * and every other offer stay inside it. Config: offers.min_discount_pct / offers.max_discount_pct.
 */
export async function discountLimits(): Promise<{ min: number; max: number }> {
  const [min, max] = await Promise.all([configNumber("offers.min_discount_pct", 5), configNumber("offers.max_discount_pct", 40)]);
  return { min: Math.min(min, max), max };
}

/** A discount percent held inside the admin's range (0 stays 0: no discount). */
export function clampDiscount(pct: number, l: { min: number; max: number }): number {
  return pct <= 0 ? 0 : Math.min(l.max, Math.max(l.min, pct));
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function putSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}
