"use client";

// A time of day in the 12-hour format (hour, minutes, AM/PM) that holds "HH:MM" (24-hour) as its
// value. Changing one box changes only that field — never another time field on the page.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

/** "14:30" → { hour: 2, minute: "30", pm: true }; anything off-grid keeps its minutes. */
function parts(value: string) {
  const [h = "0", m = "00"] = value.split(":");
  const hh = Number(h) || 0;
  return { hour: hh % 12 === 0 ? 12 : hh % 12, minute: m.padStart(2, "0"), pm: hh >= 12 };
}

function join(hour: number, minute: string, pm: boolean) {
  const h24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

/** 12-hour label for a "HH:MM" value, e.g. "2:30 PM". */
export function label12(value: string): string {
  const p = parts(value);
  return `${p.hour}:${p.minute} ${p.pm ? "PM" : "AM"}`;
}

export default function TimeSelect({
  id,
  value,
  onChange,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className: string;
}) {
  const p = parts(value);
  const minutes = MINUTES.includes(p.minute) ? MINUTES : [...MINUTES, p.minute].sort();
  const box = `${className} appearance-none px-2.5 text-center`;
  const style = { borderColor: invalid ? "#be123c" : "var(--dk-border-color-line, #e7e0d6)" };
  return (
    <div id={id} role="group" aria-label="Time" className="grid grid-cols-[1fr_1fr_1.1fr] gap-1.5">
      <select aria-label="Hour" value={p.hour} onChange={(e) => onChange(join(Number(e.target.value), p.minute, p.pm))} className={box} style={style}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select aria-label="Minutes" value={p.minute} onChange={(e) => onChange(join(p.hour, e.target.value, p.pm))} className={box} style={style}>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select aria-label="AM or PM" value={p.pm ? "PM" : "AM"} onChange={(e) => onChange(join(p.hour, p.minute, e.target.value === "PM"))} className={box} style={style}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
