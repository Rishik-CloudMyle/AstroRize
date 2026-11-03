"use client";

import { useState } from "react";
import { from24h, padTime, time12Problem, to24h, typeTime, type Period } from "@/lib/contact";

// Time of birth as people say it: "06:42" plus AM / PM. The API keeps the 24-hour "HH:MM".

const PERIODS: Period[] = ["AM", "PM"];

/**
 * The hh:mm box with an AM/PM switch beside it. Controlled: the parent keeps the typed time and
 * the period (profile form), or uses <BirthTimeInput> below, which keeps them itself.
 */
export function TimeOfBirthField({
  id,
  time,
  period,
  onTime,
  onPeriod,
  invalid,
  describedBy,
  inputClassName,
  periodLabel = "AM or PM",
}: {
  id: string;
  time: string;
  period: Period | "";
  onTime: (time: string) => void;
  onPeriod: (period: Period) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Classes for the hh:mm input (height, border, colours of the form it sits in). */
  inputClassName: string;
  periodLabel?: string;
}) {
  return (
    <div className="mt-1.5 flex min-w-0 items-stretch gap-2">
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        maxLength={5}
        value={time}
        onChange={(e) => onTime(typeTime(e.target.value))}
        onBlur={() => onTime(padTime(time))}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${inputClassName} min-w-0 flex-1`}
      />
      <div
        role="radiogroup"
        aria-label={periodLabel}
        className={`grid shrink-0 grid-cols-2 gap-1 rounded-xl border bg-cream p-1 max-lg:rounded-app-input max-lg:bg-app-surface ${
          invalid && time && !period ? "border-rose-400" : "border-line max-lg:border-app-line"
        }`}
      >
        {PERIODS.map((p) => {
          const on = period === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPeriod(p)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = p === "AM" ? "PM" : "AM";
                  onPeriod(next);
                  (e.currentTarget.parentElement?.querySelector(`[data-period="${next}"]`) as HTMLButtonElement | null)?.focus();
                }
              }}
              tabIndex={on || (!period && p === "AM") ? 0 : -1}
              data-period={p}
              className={`min-w-[52px] rounded-[9px] px-2.5 text-[13.5px] font-bold ${
                on
                  ? "bg-amber-500 text-ink shadow-[0_1px_3px_rgba(90,62,40,.15)] max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
                  : "text-stone-600 hover:text-ink max-lg:text-app-ink-2"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A self-contained time of birth for the free tools: shows 12-hour + AM/PM, reports the 24-hour
 * "HH:MM" (or "" while blank or incomplete) and, when something typed can't be used yet, why.
 */
export function BirthTimeInput({
  id,
  value,
  onChange,
  inputClassName,
  invalid,
}: {
  id: string;
  /** 24-hour "HH:MM", or "". */
  value: string;
  onChange: (value: string, problem: string | null) => void;
  inputClassName: string;
  invalid?: boolean;
}) {
  const [typed, setTyped] = useState(() => from24h(value));
  // The value changed from outside (e.g. filled from the saved profile): show it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== to24h(typed.time, typed.period)) setTyped(from24h(value));
  }

  function update(next: { time: string; period: Period | "" }) {
    setTyped(next);
    const out = to24h(next.time, next.period);
    setSeen(out);
    onChange(out, time12Problem(next.time, next.period));
  }

  const problem = time12Problem(typed.time, typed.period);
  return (
    <>
      <TimeOfBirthField
        id={id}
        time={typed.time}
        period={typed.period}
        onTime={(time) => update({ ...typed, time })}
        onPeriod={(period) => update({ ...typed, period })}
        invalid={invalid && !!problem}
        inputClassName={inputClassName}
      />
      {invalid && problem && <span className="mt-1 block text-xs font-semibold text-rose-700">{problem}</span>}
    </>
  );
}
