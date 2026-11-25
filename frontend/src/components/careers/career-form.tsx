"use client";

import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";

const MAX_BYTES = 1024 * 1024;
const AREAS = ["Astrologer", "Technical", "Marketing", "Support", "Finance", "Other"];
const FIELD = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14px] text-ink";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("We couldn't read that file."));
    r.readAsDataURL(file);
  });
}

/** The Careers form: subject, message and resume (max 1 MB). The application goes to the HR team. */
export default function CareerForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function clearFile() {
    setFile(null);
    setFileError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function pick(f: File | null) {
    setFileError("");
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setFileError("The resume is larger than 1 MB. Please attach a smaller file.");
      return;
    }
    if (f && !/\.(pdf|doc|docx)$/i.test(f.name)) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setFileError("Attach a PDF or Word file (.pdf, .doc or .docx).");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!file) {
      setFileError("Attach your resume (PDF or Word, up to 1 MB).");
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.post("/careers", {
        name: String(f.get("name") ?? ""),
        email: String(f.get("email") ?? ""),
        phone: String(f.get("phone") ?? ""),
        area: String(f.get("area") ?? ""),
        subject: String(f.get("subject") ?? ""),
        message: String(f.get("message") ?? ""),
        resumeName: file.name,
        resume: await toBase64(file),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't send your application. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-white p-6 text-center">
        <h2 className="m-0 font-display text-[26px] font-semibold text-ink">Thank you, we have your application</h2>
        <p className="mt-2 mb-0 text-[14px] text-stone-600">Our HR team will read it and get back to you by email if there is a match.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[13px] font-bold text-ink">
          Your name
          <input name="name" required maxLength={80} autoComplete="name" className={FIELD} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-bold text-ink">
          Email
          <input name="email" type="email" required maxLength={120} autoComplete="email" className={FIELD} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-bold text-ink">
          Phone (optional)
          <input name="phone" type="tel" maxLength={20} autoComplete="tel" className={FIELD} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-bold text-ink">
          Applying for
          <select name="area" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose a role type
            </option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-[13px] font-bold text-ink">
        Subject
        <input name="subject" required maxLength={120} placeholder="e.g. Vedic astrologer, 8 years of experience" className={FIELD} />
      </label>
      <label className="grid gap-1.5 text-[13px] font-bold text-ink">
        Message
        <textarea name="message" required maxLength={3000} rows={6} className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[14px] text-ink" />
      </label>
      <div className="grid gap-2 text-[13px] font-bold text-ink">
        <span id="resume-label">Resume (PDF or Word, up to 1 MB)</span>
        <input
          ref={fileInput}
          id="resume"
          type="file"
          aria-labelledby="resume-label"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file ? (
          <div className="flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-line bg-cream px-3 py-2.5 font-normal">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-[11px] font-extrabold text-amber-800 uppercase">
              {file.name.split(".").pop()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">{file.name}</span>
              <span className="block text-[12px] text-stone-600">{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </span>
            <button type="button" onClick={clearFile} aria-label={`Remove ${file.name}`} className="grid size-8 shrink-0 place-items-center rounded-full text-[18px] leading-none text-stone-600 hover:bg-stone-200 hover:text-ink">
              ×
            </button>
          </div>
        ) : (
          <label htmlFor="resume" className="inline-flex h-11 w-fit cursor-pointer items-center rounded-full border border-line bg-white px-5 text-[14px] font-bold text-ink hover:bg-cream focus-within:ring-2">
            Choose file
          </label>
        )}
        {fileError && (
          <span role="alert" className="text-[12.5px] font-semibold text-red-700">
            {fileError}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="az-cta h-12 w-full rounded-full px-6 text-[14.5px] font-bold disabled:opacity-60 sm:w-auto sm:justify-self-start">
        {busy ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}
