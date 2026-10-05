import { db } from "../db.ts";

/** Reads a numeric config value managed in the admin Config console, with a fallback. */
export async function configNumber(key: string, fallback: number): Promise<number> {
  const row = await db.configKey.findUnique({ where: { key }, select: { value: true } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function putSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}
