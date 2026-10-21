"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { PHOTO_ACCEPT, preparePhoto } from "@/components/account/profile-form";
import { api } from "@/lib/api/client";
import { readResponse } from "@/lib/api/errors";
import { apiDelete } from "@/lib/portal/request";
import Modal from "../modal";
import { useErrorToast, useToast } from "../portal-provider";

/** Gallery photos are resized in the browser first: sharp on a big screen, small to send, no camera metadata (GPS). */
const GALLERY_MAX_SIDE = 1600;

/** The stored file name of a /api/media/<file> URL (used in the DELETE path). */
const fileOf = (url: string) => url.split("/").pop() ?? "";

async function uploadPhoto(blob: Blob): Promise<string[]> {
  const res = await fetch("/api/portal/profile/gallery", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": blob.type || "image/jpeg", accept: "application/json" },
    body: blob,
  });
  return (await readResponse<{ gallery: string[] }>(res)).gallery;
}

/**
 * Photo gallery on the astrologer's public profile: add (several at once), remove, and change
 * the order with "Move earlier / later". Everything goes live straight away (no review).
 */
export default function GalleryEditor({ photos, max, maxMb }: { photos: string[]; max: number; maxMb: number }) {
  const toast = useToast();
  const showError = useErrorToast();
  const input = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState(photos);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = uploading !== null || saving || removing;
  const room = Math.max(0, max - gallery.length);

  async function chosen(files: File[]) {
    if (input.current) input.current.value = "";
    if (!files.length || busy) return;
    setProblem(null);
    if (room === 0) return setProblem(`Your gallery is full (${max} photos). Remove one to add another.`);
    const take = files.slice(0, room);
    let added = 0;
    setUploading({ done: 0, total: take.length });
    try {
      for (const file of take) {
        const blob = await preparePhoto(file, GALLERY_MAX_SIDE);
        if (blob.size > maxMb * 1024 * 1024) throw new Error(`That photo is still over ${maxMb} MB after resizing. Try another one.`);
        setGallery(await uploadPhoto(blob));
        added += 1;
        setUploading({ done: added, total: take.length });
      }
    } catch (e) {
      showError(e);
    } finally {
      setUploading(null);
    }
    if (added) {
      const skipped = files.length - take.length;
      toast(
        `${added === 1 ? "Photo" : `${added} photos`} added. ${added === 1 ? "It's" : "They're"} on your public profile now.` +
          (skipped ? ` ${skipped} more didn't fit — your gallery holds ${max}.` : ""),
      );
    }
  }

  async function move(from: number, to: number) {
    if (busy || to < 0 || to >= gallery.length) return;
    const before = gallery;
    const next = [...gallery];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setGallery(next);
    setSaving(true);
    try {
      setGallery((await api.put<{ gallery: string[] }>("/portal/profile/gallery/order", { gallery: next })).gallery);
    } catch (e) {
      setGallery(before);
      showError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove(url: string) {
    setRemoving(true);
    try {
      setGallery((await apiDelete<{ gallery: string[] }>(`/portal/profile/gallery/${encodeURIComponent(fileOf(url))}`)).gallery);
      setConfirm(null);
      toast("Photo removed from your public profile.");
    } catch (e) {
      showError(e);
    } finally {
      setRemoving(false);
    }
  }

  const iconBtn =
    "grid size-8 place-items-center rounded-full bg-white/95 text-[13px] font-bold text-ink shadow-[0_2px_6px_rgba(0,0,0,.18)] aria-disabled:opacity-35 aria-disabled:cursor-not-allowed";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-bold">Photo gallery</h2>
        <span className="inline-flex h-6 items-center rounded-full bg-cream px-2.5 text-[12px] font-bold text-stone-600 tabular-nums">
          {gallery.length} of {max}
        </span>
      </div>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-stone-500">
        Photos of you, your workspace or your practice, shown on your public profile in this order. JPEG, PNG or WebP; they go live as soon
        as they upload. Don&apos;t show phone numbers, social handles or QR codes.
      </p>

      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void chosen([...(e.target.files ?? [])])}
      />

      <ul className="grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3">
        {gallery.map((url, i) => (
          <li key={url} className="relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line bg-cream">
            <Image src={url} alt={`Gallery photo ${i + 1}`} fill unoptimized sizes="200px" className="object-cover" />
            <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-ink/75 text-[11px] font-bold text-white tabular-nums">
              {i + 1}
            </span>
            <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5">
              <button
                type="button"
                aria-label={`Move photo ${i + 1} earlier`}
                aria-disabled={i === 0 || busy}
                onClick={() => void move(i, i - 1)}
                className={iconBtn}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={`Move photo ${i + 1} later`}
                aria-disabled={i === gallery.length - 1 || busy}
                onClick={() => void move(i, i + 1)}
                className={iconBtn}
              >
                ›
              </button>
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                aria-disabled={busy}
                onClick={() => !busy && setConfirm(url)}
                className={`${iconBtn} ml-auto text-rose-700`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {room > 0 && (
          <li className="aspect-[4/3]">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="grid size-full place-content-center justify-items-center gap-1 rounded-[14px] border border-dashed border-amber-400 bg-amber-50/60 px-2 text-center text-amber-800 disabled:opacity-60"
            >
              <span className="text-[20px] leading-none">＋</span>
              <span className="text-[12.5px] font-bold">
                {uploading ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : "Add photos"}
              </span>
              {!uploading && <span className="text-[11px] text-amber-700/80">{room === 1 ? "1 more fits" : `${room} more fit`}</span>}
            </button>
          </li>
        )}
      </ul>

      {gallery.length === 0 && !uploading && (
        <p className="mt-2.5 text-[12.5px] text-stone-500">No photos yet. Customers see &ldquo;Photos coming soon&rdquo; on your profile until you add some.</p>
      )}
      {room === 0 && (
        <p className="mt-2.5 text-[12.5px] text-stone-500">Your gallery is full. Remove a photo to add another.</p>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-700">
          {problem}
        </p>
      )}

      {confirm && (
        <Modal onClose={() => setConfirm(null)} labelledBy="remove-photo-title">
          <h2 id="remove-photo-title" className="m-0 font-display text-[26px] font-semibold text-ink">
            Remove this photo?
          </h2>
          <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-[14px] bg-cream">
            <Image src={confirm} alt="" fill unoptimized sizes="360px" className="object-cover" />
          </div>
          <p className="mt-3 text-[13.5px] leading-normal text-stone-600">
            It disappears from your public profile straight away. You can add it again any time.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => setConfirm(null)} className="h-11 rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink">
              Keep it
            </button>
            <button type="button" onClick={() => void remove(confirm)} disabled={removing} className="h-11 rounded-xl bg-rose-700 px-5 text-[14px] font-bold text-white disabled:opacity-60">
              {removing ? "Removing…" : "Remove photo"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
