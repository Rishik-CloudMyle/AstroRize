"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { preparePhoto } from "@/components/account/profile-form";
import { readResponse } from "@/lib/api/errors";
import type { MessageAttachment } from "@/lib/messages";

// Photos and short videos in customer–astrologer messages: choosing and checking a file in the
// browser, uploading it with progress, and showing it in the conversation (with a full-screen
// photo viewer). Used by the customer's Messenger and the astrologer portal's Messages.
// The API checks everything again (POST …/attachment) and serves the files only to the two people
// in the conversation.

export const CHAT_MAX_PHOTO_MB = 5;
export const CHAT_MAX_VIDEO_MB = 25;
export const CHAT_MAX_VIDEO_SECONDS = 60;
/** Photos are re-encoded in the browser (WebP) to at most this many pixels on the long side, and lose camera metadata. */
const CHAT_PHOTO_MAX_SIDE = 1600;
const MB = 1024 * 1024;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm" };
export const ATTACH_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm";
export const ATTACH_LIMITS = `Photos up to ${CHAT_MAX_PHOTO_MB} MB · videos up to ${CHAT_MAX_VIDEO_SECONDS} seconds and ${CHAT_MAX_VIDEO_MB} MB.`;
const ALLOWED = "Choose a photo (JPEG, PNG or WebP) or a video (MP4 or WebM).";

/** A file ready to send: what goes up, and a local preview of it. */
export interface PreparedFile {
  kind: "image" | "video";
  blob: Blob;
  type: string;
  /** Object URL for the preview chip; revoke with releaseFile. */
  previewUrl: string;
  name: string;
}

export function releaseFile(f: PreparedFile | null) {
  if (f) URL.revokeObjectURL(f.previewUrl);
}

const sizeText = (bytes: number) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`);

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function kindOf(file: File): "image" | "video" | null {
  if (PHOTO_TYPES.includes(file.type) || (!file.type && ["jpg", "jpeg", "png", "webp"].includes(extOf(file.name)))) return "image";
  if (Object.values(VIDEO_TYPES).includes(file.type) || (!file.type && extOf(file.name) in VIDEO_TYPES)) return "video";
  return null;
}

/** The video's length in seconds, read by the browser; null when it can't tell (some WebM files). */
function readDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    let settled = false;
    const done = (d: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

/**
 * Checks a chosen file (type, size, video length) and prepares it: photos are resized and
 * re-encoded as WebP (smaller, and free of GPS and other camera metadata). Videos go up as they
 * are; the server compresses them after upload. Throws an Error with a
 * message to show the person.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`That file can't be sent. ${ALLOWED}`);
  if (kind === "image") {
    const blob = await preparePhoto(file, CHAT_PHOTO_MAX_SIDE);
    if (blob.size > CHAT_MAX_PHOTO_MB * MB) throw new Error(`That photo is too large to send. Photos can be up to ${CHAT_MAX_PHOTO_MB} MB.`);
    return { kind, blob, type: blob.type || "image/jpeg", previewUrl: URL.createObjectURL(blob), name: file.name };
  }
  if (file.size > CHAT_MAX_VIDEO_MB * MB) {
    throw new Error(`That video is ${Math.ceil(file.size / MB)} MB. Videos can be up to ${CHAT_MAX_VIDEO_MB} MB.`);
  }
  const seconds = await readDuration(file);
  if (seconds !== null && seconds > CHAT_MAX_VIDEO_SECONDS + 0.5) {
    throw new Error(`That video is ${Math.round(seconds)} seconds long. Videos can be up to ${CHAT_MAX_VIDEO_SECONDS} seconds.`);
  }
  const type = file.type || VIDEO_TYPES[extOf(file.name)]!;
  return { kind, blob: file, type, previewUrl: URL.createObjectURL(file), name: file.name };
}

/** Sends a prepared file to `path` (an /api/… URL) with an optional caption, reporting progress 0–100. */
export function uploadFile<T>(path: string, file: PreparedFile, caption: string, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", caption ? `${path}?caption=${encodeURIComponent(caption)}` : path);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const res = new Response(xhr.responseText || null, { status: xhr.status, headers: { "content-type": "application/json" } });
      readResponse<T>(res).then(resolve, reject);
    };
    xhr.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
    xhr.send(file.blob);
  });
}

/** Paperclip button that opens the file picker. */
export function AttachButton({
  onPick,
  disabled,
  size = 48,
  className = "",
}: {
  onPick: (file: File) => void;
  disabled?: boolean;
  size?: number;
  /** Extra classes (the customer messenger restyles it below 1024px). */
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ATTACH_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label="Attach a photo or video"
        title="Attach a photo or video"
        className={`grid shrink-0 place-items-center rounded-full border border-line bg-white text-stone-600 hover:border-amber-300 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        style={{ width: size, height: size }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21.4 11.6l-8.5 8.5a5.5 5.5 0 01-7.8-7.8l8.5-8.5a3.7 3.7 0 015.2 5.2l-8.5 8.5a1.8 1.8 0 01-2.6-2.6l7.8-7.8" />
        </svg>
      </button>
    </>
  );
}

/** The chosen file above the composer: a thumbnail (or the video's first frame), its name, ✕ to remove, and upload progress. */
export function AttachmentChip({ file, progress, onRemove }: { file: PreparedFile; progress: number | null; onRemove: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-1.5">
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-cream">
        {file.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview (object URL), not a site image
          <img src={file.previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <>
            <video src={`${file.previewUrl}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden="true" />
            <span className="absolute inset-0 grid place-items-center text-white drop-shadow" aria-hidden="true">
              ▶
            </span>
          </>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] text-ink">{file.kind === "image" ? "Photo" : "Video"}</b>
        <span className="block truncate text-[11.5px] text-stone-500">
          {progress !== null ? `Sending… ${progress}%` : `${sizeText(file.blob.size)} · ${file.name}`}
        </span>
        {progress !== null && (
          <span
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-200"
          >
            <span className="block h-full bg-amber-500 transition-[width]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={progress !== null}
        aria-label="Remove the attachment"
        className="grid size-11 shrink-0 place-items-center rounded-full text-[18px] text-stone-500 hover:bg-cream hover:text-ink disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Picking and checking a file for the composer. `busy` while it is being prepared. `error` is a
 * friendly message for a file that can't be sent.
 */
export function useAttachment() {
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<PreparedFile | null>(null);

  // Free the preview when the conversation closes.
  useEffect(() => () => releaseFile(current.current), []);

  const set = (f: PreparedFile | null) => {
    releaseFile(current.current);
    current.current = f;
    setFile(f);
  };

  async function pick(chosen: File) {
    setError("");
    setPreparing(true);
    try {
      set(await prepareFile(chosen));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file can't be sent.");
    } finally {
      setPreparing(false);
    }
  }

  return { file, preparing, error, setError, pick, clear: () => set(null) };
}

/**
 * A photo or video inside a message bubble. Photos are thumbnails that open full screen; videos
 * play inline (after the server has compressed them: until then a "Processing video…" box). `onLoad`
 * lets the conversation keep its newest message in view once a photo has its size. `mine` = the
 * viewer sent it (changes the wording when a video couldn't be processed).
 */
export function MessageMedia({ attachment, onLoad, mine = false }: { attachment: MessageAttachment; onLoad?: () => void; mine?: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const { url } = attachment;

  if (attachment.kind === "video" && attachment.state === "processing") {
    return (
      <span
        role="status"
        className="mb-1 flex h-[146px] w-[260px] max-w-full flex-col items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 text-center text-white"
      >
        <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
        <b className="text-[13px]">Processing video…</b>
        <span className="text-[11.5px] text-white/70">{mine ? "It'll be ready to play in a moment." : "It'll play here in a moment."}</span>
      </span>
    );
  }
  if (attachment.state === "failed" || !url) {
    return (
      <span role="note" className="mb-1 flex min-h-20 w-[220px] max-w-full flex-col items-center justify-center rounded-xl bg-cream px-3 py-2 text-center text-[12px] text-stone-600">
        {attachment.kind === "image" ? (
          "This photo isn't available."
        ) : (
          <>
            <b className="text-ink">This video couldn&apos;t be processed.</b>
            {mine ? "The file may be damaged. Try sending it again." : "The file may be damaged."}
          </>
        )}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="mb-1 flex h-20 w-[220px] max-w-full items-center justify-center rounded-xl bg-cream px-3 text-center text-[12px] text-stone-500">
        {attachment.kind === "image" ? "This photo isn't available." : "This video isn't available."}
      </span>
    );
  }
  if (attachment.kind === "video") {
    return (
      <video
        src={url}
        poster={attachment.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoad}
        onError={() => setFailed(true)}
        className="mb-1 block max-h-[320px] w-[260px] max-w-full rounded-xl bg-black"
        aria-label="Video"
      />
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open photo full screen"
        className="mb-1 block w-fit max-w-[260px] overflow-hidden rounded-xl bg-cream"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private file for this conversation only; the image optimiser can't fetch it */}
        <img
          src={url}
          alt="Photo"
          loading="lazy"
          onLoad={onLoad}
          onError={() => setFailed(true)}
          className="block max-h-[320px] min-h-16 w-auto max-w-full min-w-16 object-contain"
        />
      </button>
      {open && <Lightbox src={url} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Full-screen photo viewer: Esc, ✕ or a tap outside the photo closes it; focus stays inside and returns after. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab") {
        // The close button is the only control: keep focus on it.
        e.preventDefault();
        closeBtn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-3 sm:p-8"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a private file for this conversation only */}
      <img src={src} alt="Photo" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        ref={closeBtn}
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-white/15 text-[20px] text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
