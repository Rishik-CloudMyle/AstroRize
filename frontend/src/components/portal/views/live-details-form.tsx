"use client";

import { useState } from "react";
import { M_INPUT, M_LABEL } from "../ui";

export interface LiveDetails {
  title: string;
  topic: string;
  category: string;
  language: string;
  durationMins: number;
}

const MAX_TEXT = 80;
const MIN_DURATION = 5;
const MAX_DURATION = 480;
/** Quick picks for the expected duration; any whole number of minutes in range can be typed. */
const DURATIONS = [15, 30, 45, 60, 90, 120];

const input = `mt-1.5 h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-amber-400 ${M_INPUT}`;
const label = `block text-[13px] font-bold text-ink ${M_LABEL}`;

/** What is wrong with the details, by field (empty = fine). Same rules as the API (spec AR-LIVE §4). */
export function checkLiveDetails(d: LiveDetails, categories: string[], languages: string[]): Partial<Record<keyof LiveDetails, string>> {
  const errors: Partial<Record<keyof LiveDetails, string>> = {};
  if (d.title.trim().length < 3) errors.title = "Give your live a title of at least 3 characters.";
  if (d.topic.trim().length < 3) errors.topic = "Give your live a topic, e.g. “Saturn transit Q&A”.";
  if (!categories.includes(d.category)) errors.category = "Choose a category.";
  if (!languages.includes(d.language)) errors.language = "Choose a language.";
  if (!Number.isInteger(d.durationMins) || d.durationMins < MIN_DURATION || d.durationMins > MAX_DURATION) {
    errors.durationMins = `Enter between ${MIN_DURATION} and ${MAX_DURATION} minutes.`;
  }
  return errors;
}

/**
 * Title, topic, category, language and expected duration of a live: asked when going live,
 * and editable while live. `onSubmit` gets the trimmed details once they pass the checks.
 */
export default function LiveDetailsForm({
  idPrefix,
  initial,
  categories,
  languages,
  busy,
  onSubmit,
  children,
}: {
  idPrefix: string;
  initial: LiveDetails;
  categories: string[];
  languages: string[];
  busy: boolean;
  onSubmit: (details: LiveDetails) => void;
  /** The submit button(s). */
  children: React.ReactNode;
}) {
  const [d, setD] = useState(initial);
  const [durationText, setDurationText] = useState(initial.durationMins ? String(initial.durationMins) : "");
  const [errors, setErrors] = useState<Partial<Record<keyof LiveDetails, string>>>({});
  const set = <K extends keyof LiveDetails>(k: K, v: LiveDetails[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { ...d, title: d.title.trim(), topic: d.topic.trim() };
    const found = checkLiveDetails(next, categories, languages);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`${idPrefix}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    onSubmit(next);
  };

  const help = (k: keyof LiveDetails, text: string) => (
    <p id={`${idPrefix}-${k}-help`} className={`mt-1.5 text-[12px] ${errors[k] ? "font-semibold text-rose-700" : "text-stone-500"}`}>
      {errors[k] ?? text}
    </p>
  );
  const field = (k: keyof LiveDetails) => ({
    id: `${idPrefix}-${k}`,
    "aria-invalid": !!errors[k],
    "aria-describedby": `${idPrefix}-${k}-help`,
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
      <div>
        <label htmlFor={`${idPrefix}-title`} className={label}>
          Title
        </label>
        <input
          {...field("title")}
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={MAX_TEXT}
          placeholder="e.g. Saturn transit — your questions answered"
          className={input}
        />
        {help("title", `The headline customers see on your live. Up to ${MAX_TEXT} characters.`)}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-topic`} className={label}>
          Topic
        </label>
        <input
          {...field("topic")}
          value={d.topic}
          onChange={(e) => set("topic", e.target.value)}
          maxLength={MAX_TEXT}
          placeholder="e.g. Saturn transit Q&A"
          className={input}
        />
        {help("topic", "Shown in the “just went live” notice. No phone numbers or emails.")}
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-category`} className={label}>
            Category
          </label>
          <select {...field("category")} value={d.category} onChange={(e) => set("category", e.target.value)} className={input}>
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {help("category", "Helps customers find your live.")}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-language`} className={label}>
            Language
          </label>
          <select {...field("language")} value={d.language} onChange={(e) => set("language", e.target.value)} className={input}>
            <option value="" disabled>
              Choose a language
            </option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {help("language", "From the languages on your profile.")}
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-durationMins`} className={label}>
          Expected duration (minutes)
        </label>
        <input
          {...field("durationMins")}
          inputMode="numeric"
          value={durationText}
          onChange={(e) => {
            const text = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
            setDurationText(text);
            set("durationMins", text ? Number(text) : 0);
          }}
          placeholder="e.g. 45"
          className={`${input} max-w-[160px]`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick durations">
          {DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={d.durationMins === m}
              onClick={() => {
                setDurationText(String(m));
                set("durationMins", m);
              }}
              className={`h-8 rounded-full border px-3 text-[12.5px] font-bold max-lg:h-[34px] max-lg:text-[12px] ${
                d.durationMins === m
                  ? "border-amber-500 bg-amber-100 text-amber-900 max-lg:border-app-selected max-lg:bg-app-tint max-lg:text-app-active"
                  : "border-line bg-white text-stone-600 max-lg:border-app-line-gold max-lg:text-app-ink"
              }`}
            >
              {m < 60 ? `${m} min` : `${m / 60} h`}
            </button>
          ))}
        </div>
        {help("durationMins", `Roughly how long you plan to stay live: ${MIN_DURATION} minutes to 8 hours.`)}
      </div>
      <div className="flex flex-wrap items-center gap-2.5" aria-busy={busy}>
        {children}
      </div>
    </form>
  );
}
