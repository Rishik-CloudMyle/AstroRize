"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readResponse } from "@/lib/api/errors";
import { apiDelete } from "@/lib/portal/request";
import IntroVideo, { IntroVideoPlaceholder } from "../../astrologer/intro-video";
import Modal from "../modal";
import { useErrorToast, useToast } from "../portal-provider";

const TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm" };

/** The file's video type from the browser, or from its extension when the browser doesn't say. */
function videoType(file: File): string | null {
  if (Object.values(TYPES).includes(file.type)) return file.type;
  if (file.type) return null;
  return TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** The video's length in seconds, read by the browser; null when it can't tell (some WebM files). */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

/** Uploads with progress (fetch can't report upload progress). */
function upload(file: File, type: string, onProgress: (pct: number) => void): Promise<{ introVideoUrl: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/portal/profile/video");
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const res = new Response(xhr.responseText || null, { status: xhr.status, headers: { "content-type": "application/json" } });
      readResponse<{ introVideoUrl: string }>(res).then(resolve, reject);
    };
    xhr.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
    xhr.send(file);
  });
}

/**
 * Intro video on the astrologer's public profile: upload, replace or remove. MP4 or WebM, up
 * to `maxMb` MB and `maxSeconds` long. It goes live on the profile at once (no review).
 */
export default function IntroVideoEditor({
  url,
  poster,
  name,
  maxMb,
  maxSeconds,
}: {
  url: string | null;
  poster: string;
  name: string;
  maxMb: number;
  maxSeconds: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const busy = progress !== null || removing;
  const limitText = `MP4 or WebM, up to ${maxSeconds / 60} minutes and ${maxMb} MB.`;

  async function chosen(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file || busy) return;
    setProblem(null);
    const type = videoType(file);
    if (!type) return setProblem(`That file isn't an MP4 or WebM video. ${limitText}`);
    if (file.size > maxMb * 1024 * 1024) return setProblem(`That video is ${(file.size / (1024 * 1024)).toFixed(0)} MB. Intro videos can be up to ${maxMb} MB.`);
    const secs = await readDuration(file);
    if (secs !== null && secs > maxSeconds + 0.5) {
      return setProblem(`That video is ${Math.round(secs)} seconds long. Intro videos can be up to ${maxSeconds / 60} minutes.`);
    }
    setProgress(0);
    try {
      await upload(file, type, setProgress);
      toast(url ? "Intro video replaced. It's on your public profile now." : "Intro video added. It's on your public profile now.");
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await apiDelete("/portal/profile/video");
      setConfirmRemove(false);
      toast("Intro video removed from your public profile.");
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-bold">Intro video</h2>
        <span
          className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold ${url ? "bg-emerald-50 text-emerald-700" : "bg-cream text-stone-600"}`}
        >
          {url ? "Live on your profile" : "Not added yet"}
        </span>
      </div>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-stone-500">
        {url ? "Customers see this on your public profile. " : "Introduce yourself to customers on your public profile. "}
        {limitText} It goes live as soon as it uploads.
      </p>
      {url ? (
        <IntroVideo key={url} src={url} poster={poster} name={name} className="mb-3" heightClass="h-[200px] sm:h-[240px]" />
      ) : (
        <IntroVideoPlaceholder
          poster={poster}
          label="No intro video yet"
          note="Until you add one, customers see “Intro video coming soon” here."
          className="mb-3"
          heightClass="h-[200px] sm:h-[240px]"
        />
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,.mp4,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void chosen(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={`h-10 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-60 ${url ? "border border-line bg-white" : "bg-[linear-gradient(90deg,#ffd233,#ff8c1a)] text-cta-ink"}`}
        >
          {progress !== null ? `Uploading… ${progress}%` : url ? "Replace video" : "Upload intro video"}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            className="h-10 rounded-[10px] px-3 text-[13px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            Remove
          </button>
        )}
      </div>
      {progress !== null && (
        <div role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <span className="block h-full bg-amber-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-700">
          {problem}
        </p>
      )}

      {confirmRemove && (
        <Modal onClose={() => setConfirmRemove(false)} labelledBy="remove-video-title">
          <h2 id="remove-video-title" className="m-0 font-display text-[26px] font-semibold text-ink">
            Remove your intro video?
          </h2>
          <p className="mt-2 text-[13.5px] leading-normal text-stone-600">It disappears from your public profile straight away. You can upload a new one any time.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => setConfirmRemove(false)} className="h-11 rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink">
              Keep it
            </button>
            <button type="button" onClick={() => void remove()} disabled={removing} className="h-11 rounded-xl bg-rose-700 px-5 text-[14px] font-bold text-white">
              Remove video
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
