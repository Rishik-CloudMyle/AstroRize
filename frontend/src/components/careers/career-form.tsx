"use client";

import { useState } from "react";
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

  function pick(f: File | null) {
    setFileError("");
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      setFileError("The resume is larger than 1 MB. Please attach a smaller file.");
      return;
    }
    if (f && !/\.(pdf|doc|docx)$/i.test(f.name)) {
      setFile(null);
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
      <div className="grid gap-1.5 text-[13px] font-bold text-ink">
        <label htmlFor="resume">Resume (PDF or Word, up to 1 MB)</label>
        <input
          id="resume"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-dashed border-line bg-cream p-3 text-[13px] font-normal text-stone-700"
        />
        {file && <span className="text-[12px] font-normal text-stone-600">{file.name} · {Math.max(1, Math.round(file.size / 1024))} KB</span>}
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
