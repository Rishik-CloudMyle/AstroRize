"use client";

// The six-digit code field used by log in and sign up. Desktop (>= 1024px): the one wide input it
// always was (`className`). Phones/tablets: the mobile app prototype's six boxes — the real input
// sits invisibly on top of them, so typing, pasting, autofill (one-time-code) and screen readers all
// keep working on one ordinary <input>.

export default function OtpInput({
  id,
  value,
  onChange,
  className,
  invalid,
}: {
  id: string;
  value: string;
  /** Called with digits only, at most six. */
  onChange: (digits: string) => void;
  /** The desktop input's classes. */
  className: string;
  invalid?: boolean;
}) {
  const active = Math.min(value.length, 5);
  return (
    <div className="relative max-lg:mt-2">
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`peer ${className} max-lg:absolute max-lg:inset-0 max-lg:z-10 max-lg:m-0! max-lg:size-full max-lg:min-h-0 max-lg:opacity-0`}
      />
      <div
        aria-hidden="true"
        className="hidden grid-cols-6 gap-2 max-lg:grid peer-focus-visible:[&>.on]:border-app-selected peer-focus-visible:[&>.on]:ring-2 peer-focus-visible:[&>.on]:ring-app-tint-3 peer-focus:[&>.on]:border-app-selected"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`grid h-[54px] min-w-0 place-items-center rounded-app-input border bg-app-surface text-[22px] font-bold text-app-ink ${
              invalid ? "border-app-error" : "border-app-line"
            } ${i === active ? "on" : ""}`}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
