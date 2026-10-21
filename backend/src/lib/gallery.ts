import { db } from "../db.ts";
import { lockKey } from "./consultations.ts";
import { conflict } from "./errors.ts";
import { GALLERY_MAX_DEFAULT, deleteMedia } from "./media.ts";
import { configNumber } from "./settings.ts";

// An astrologer's photo gallery on their public profile: public photo URLs in display order
// (Astrologer.gallery). Published at once, no staff review (same as the intro video); staff can
// take a photo down from the lifecycle record. Every change runs under a per-astrologer lock so
// two tabs (or the astrologer and staff) can't overwrite each other's edits.

/** Photos one astrologer may show (Config "profile.gallery.max"). */
export async function galleryMax(): Promise<number> {
  const n = await configNumber("profile.gallery.max", GALLERY_MAX_DEFAULT);
  return Math.max(0, Math.min(50, Math.floor(n)));
}

const lockName = (astrologerId: string) => `gallery:${astrologerId}`;

/** Appends an uploaded photo. Throws (409) when the gallery is already full. */
export async function addGalleryPhoto(astrologerId: string, url: string, max: number): Promise<string[]> {
  return db.$transaction(async (tx) => {
    await lockKey(tx, lockName(astrologerId));
    const { gallery } = await tx.astrologer.findUniqueOrThrow({ where: { id: astrologerId }, select: { gallery: true } });
    if (gallery.length >= max) throw conflict(`Your gallery is full (${max} photos). Remove one to add another.`);
    const next = [...gallery, url];
    await tx.astrologer.update({ where: { id: astrologerId }, data: { gallery: next } });
    return next;
  });
}

/**
 * Takes one photo out of the gallery and deletes its file. `removed` is false when it wasn't
 * there (already removed in another tab), which callers treat as done.
 */
export async function removeGalleryPhoto(astrologerId: string, url: string): Promise<{ gallery: string[]; removed: boolean; position: number }> {
  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, lockName(astrologerId));
    const { gallery } = await tx.astrologer.findUniqueOrThrow({ where: { id: astrologerId }, select: { gallery: true } });
    const at = gallery.indexOf(url);
    if (at < 0) return { gallery, removed: false, position: 0 };
    const next = gallery.filter((u) => u !== url);
    await tx.astrologer.update({ where: { id: astrologerId }, data: { gallery: next } });
    return { gallery: next, removed: true, position: at + 1 };
  });
  // The file goes once the database no longer points at it.
  if (result.removed) await deleteMedia(url);
  return result;
}

/** Puts the gallery in a new order. `order` must hold exactly the photos there now. */
export async function reorderGallery(astrologerId: string, order: string[]): Promise<{ gallery: string[]; changed: boolean }> {
  return db.$transaction(async (tx) => {
    await lockKey(tx, lockName(astrologerId));
    const { gallery } = await tx.astrologer.findUniqueOrThrow({ where: { id: astrologerId }, select: { gallery: true } });
    const same = order.length === gallery.length && new Set(order).size === order.length && order.every((u) => gallery.includes(u));
    if (!same) throw conflict("Your gallery changed in another window. Reload the page and try again.");
    if (order.join("|") === gallery.join("|")) return { gallery, changed: false };
    await tx.astrologer.update({ where: { id: astrologerId }, data: { gallery: order } });
    return { gallery: order, changed: true };
  });
}
