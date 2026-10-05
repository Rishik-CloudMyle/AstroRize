"use client";

import Link from "next/link";
import { useState } from "react";
import type { Tool } from "@/lib/types";
import {
  KARANAS,
  KOOTAS,
  KUNDLI_PLANETS,
  NAKSHATRAS,
  NUMBER_MEANINGS,
  RAHU_KAAL,
  TAROT_CARDS,
  TITHIS,
  YOGAS,
  ZODIAC_SIGNS,
} from "@/lib/mock/tools";
import { useAppUI } from "../app-provider";
import KundliChart from "./kundli-chart";

// ⚠ Mock results so every tool works end to end. Numerology uses the real
// formulas; the astronomical tools return sample values until the backend
// provides real calculations.

/** Small stable hash, so the same inputs always give the same mock result. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export default function ToolRunner({ tool }: { tool: Tool }) {
  switch (tool.id) {
    case "kundli":
      return <KundliTool tool={tool} />;
    case "horoscope":
      return <HoroscopeTool tool={tool} />;
    case "daily":
      return <DailyTool tool={tool} />;
    case "matchmaking":
      return <MatchmakingTool tool={tool} />;
    case "panchang":
      return <PanchangTool tool={tool} />;
    case "numerology":
      return <NumerologyTool tool={tool} />;
    case "tarot":
      return <TarotTool tool={tool} />;
    default:
      return null;
  }
}

// ---------- Shared building blocks ----------

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-amber-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-stone-600">{label}</span>
      {children}
    </label>
  );
}

function FormCard({
  title,
  onSubmit,
  submitLabel,
  children,
}: {
  title: string;
  onSubmit: () => void;
  submitLabel: string;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]"
    >
      <h2 className="font-display text-[26px] font-semibold text-ink">{title}</h2>
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">{children}</div>
      <button type="submit" className="az-cta mt-5 h-12 w-full rounded-full px-6 text-[15px] font-bold sm:w-auto">
        {submitLabel}
      </button>
    </form>
  );
}

function SignSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {ZODIAC_SIGNS.map((s) => (
        <option key={s.name} value={s.name}>
          {s.name} ({s.hindi})
        </option>
      ))}
    </select>
  );
}

/** The result panel: title, extra header buttons, AI label, share link and the astrologer CTA. */
function ResultCard({
  tool,
  title,
  actions,
  children,
}: {
  tool: Tool;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { toast } = useAppUI();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/free-tools/${tool.id}`);
      toast(`${tool.name} result link copied to your clipboard.`);
    } catch {
      toast("Couldn't copy automatically — copy the link from your address bar.");
    }
  }

  return (
    <section aria-live="polite" className="az-rise mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Your result</div>
          <h2 className="mt-1 font-display text-[28px] font-semibold text-ink">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={copyLink}
            className="h-[34px] rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink"
          >
            Copy link
          </button>
        </div>
      </div>
      <div className="mt-5">{children}</div>
      <div className="mt-[18px] flex items-start gap-3 rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px]">
        <span className="text-[15px] leading-[1.3]">ⓘ</span>
        <div className="text-[13px] leading-normal text-blue-800">
          <b>AI-generated — for guidance; not professional advice.</b> Read the{" "}
          <Link href="/terms#ai">full disclaimer</Link>.
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3.5">
        <span className="text-xs text-stone-500">Share this result · astrorize.com/free-tools/{tool.id}</span>
        <Link
          href="/astrologers"
          className="az-cta inline-flex h-[42px] items-center rounded-full px-5 text-sm font-bold hover:text-cta-ink hover:no-underline"
        >
          Ask an astrologer about this →
        </Link>
      </div>
    </section>
  );
}

function PillToggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`h-[34px] rounded-full border px-3.5 text-[13px] font-bold ${
              on ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-stone-600"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </>
  );
}

const thClass =
  "border-b-2 border-line bg-cream px-2.5 py-[9px] text-left text-[11px] uppercase tracking-[.08em] text-stone-500";
const tdClass = "border-b border-line-soft px-2.5 py-[9px] text-stone-600";

// ---------- Kundli ----------

function KundliTool({ tool }: { tool: Tool }) {
  const [form, setForm] = useState({ name: "", date: "", time: "", place: "" });
  const [submitted, setSubmitted] = useState<typeof form | null>(null);
  const [chart, setChart] = useState<"north" | "south">("north");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <FormCard title="Enter your birth details" submitLabel="Make my Kundli" onSubmit={() => setSubmitted(form)}>
        <Field label="Full name">
          <input required value={form.name} onChange={set("name")} className={inputClass} autoComplete="name" />
        </Field>
        <Field label="Place of birth">
          <input required value={form.place} onChange={set("place")} placeholder="e.g. Pune, India" className={inputClass} />
        </Field>
        <Field label="Date of birth">
          <input required type="date" value={form.date} onChange={set("date")} className={inputClass} />
        </Field>
        <Field label="Time of birth">
          <input required type="time" value={form.time} onChange={set("time")} className={inputClass} />
        </Field>
      </FormCard>

      {submitted && (
        <ResultCard
          tool={tool}
          title={`${submitted.name.split(" ")[0]}'s Kundli`}
          actions={
            <PillToggle
              options={[
                { key: "north", label: "North chart" },
                { key: "south", label: "South chart" },
              ]}
              value={chart}
              onChange={(k) => setChart(k as "north" | "south")}
            />
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-line">
              <KundliChart style={chart} />
            </div>
            <div className="min-w-0 overflow-x-auto">
              <p className="mb-3 text-[13px] text-stone-600">
                Born {new Date(submitted.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}{" "}
                at {submitted.time} · {submitted.place} · Ascendant <b>Aries</b>
              </p>
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr>
                    <th className={thClass}>Planet</th>
                    <th className={thClass}>House</th>
                    <th className={thClass}>Sign</th>
                    <th className={thClass}>Degree</th>
                  </tr>
                </thead>
                <tbody>
                  {KUNDLI_PLANETS.map((p) => (
                    <tr key={p.planet}>
                      <td className={`${tdClass} font-semibold text-ink`}>{p.planet}</td>
                      <td className={`${tdClass} tabular-nums`}>{p.house}</td>
                      <td className={tdClass}>{p.sign}</td>
                      <td className={`${tdClass} tabular-nums`}>{p.deg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ResultCard>
      )}
    </>
  );
}

// ---------- Horoscope & Daily insight ----------

function HoroscopeTool({ tool }: { tool: Tool }) {
  const [sign, setSign] = useState(ZODIAC_SIGNS[0].name);
  const [period, setPeriod] = useState<"today" | "week">("today");
  const s = ZODIAC_SIGNS.find((z) => z.name === sign) ?? ZODIAC_SIGNS[0];

  return (
    <>
      <div className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
        <h2 className="font-display text-[26px] font-semibold text-ink">Choose your Moon sign</h2>
        <div className="mt-4 max-w-sm">
          <Field label="Moon sign (rashi)">
            <SignSelect value={sign} onChange={setSign} />
          </Field>
        </div>
      </div>
      <ResultCard
        tool={tool}
        title={`${s.name} · ${period === "today" ? "Today" : "This week"}`}
        actions={
          <PillToggle
            options={[
              { key: "today", label: "Daily" },
              { key: "week", label: "Weekly" },
            ]}
            value={period}
            onChange={(k) => setPeriod(k as "today" | "week")}
          />
        }
      >
        <p className="max-w-[60ch] font-display text-[22px] font-medium leading-[1.4] text-ink">
          {period === "today" ? s.today : s.week}
        </p>
        <p className="mt-2 text-[13px] text-stone-500">
          {s.name} ({s.hindi}) · read by Moon sign, the Vedic convention
        </p>
      </ResultCard>
    </>
  );
}

function DailyTool({ tool }: { tool: Tool }) {
  const [sign, setSign] = useState(ZODIAC_SIGNS[0].name);
  const s = ZODIAC_SIGNS.find((z) => z.name === sign) ?? ZODIAC_SIGNS[0];

  return (
    <>
      <div className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
        <h2 className="font-display text-[26px] font-semibold text-ink">Your sign</h2>
        <div className="mt-4 max-w-sm">
          <Field label="Moon sign (rashi)">
            <SignSelect value={sign} onChange={setSign} />
          </Field>
        </div>
      </div>
      <ResultCard tool={tool} title="One thing today">
        <blockquote className="max-w-[56ch] rounded-2xl border border-amber-200 bg-linear-140 from-amber-50 to-amber-100 p-5 font-display text-2xl font-semibold leading-[1.35] text-ink">
          “{s.today}”
        </blockquote>
        <p className="mt-2 text-[13px] text-stone-500">For {s.name} ({s.hindi})</p>
      </ResultCard>
    </>
  );
}

// ---------- Matchmaking ----------

function MatchmakingTool({ tool }: { tool: Tool }) {
  const [form, setForm] = useState({ nameA: "", dateA: "", nameB: "", dateB: "" });
  const [result, setResult] = useState<{ names: [string, string]; scores: number[] } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function calculate() {
    const seed = hash(`${form.nameA}|${form.dateA}|${form.nameB}|${form.dateB}`);
    const scores = KOOTAS.map((k, i) => {
      const r = (seed >>> (i * 3)) % (k.max * 2 + 1);
      return Math.min(k.max, Math.round(r / 2 + k.max / 4));
    });
    setResult({ names: [form.nameA, form.nameB], scores });
  }

  const total = result ? result.scores.reduce((a, b) => a + b, 0) : 0;
  const verdict =
    total >= 28 ? "Excellent match" : total >= 18 ? "Good match — acceptable by tradition" : "Below the traditional 18-point threshold";

  return (
    <>
      <FormCard title="Enter both birth details" submitLabel="Match the charts" onSubmit={calculate}>
        <Field label="First person's name">
          <input required value={form.nameA} onChange={set("nameA")} className={inputClass} />
        </Field>
        <Field label="First person's date of birth">
          <input required type="date" value={form.dateA} onChange={set("dateA")} className={inputClass} />
        </Field>
        <Field label="Second person's name">
          <input required value={form.nameB} onChange={set("nameB")} className={inputClass} />
        </Field>
        <Field label="Second person's date of birth">
          <input required type="date" value={form.dateB} onChange={set("dateB")} className={inputClass} />
        </Field>
      </FormCard>

      {result && (
        <ResultCard tool={tool} title={`${result.names[0]} & ${result.names[1]}`}>
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid size-28 place-items-center rounded-full border-4 border-amber-300 bg-amber-50 text-center">
              <div>
                <div className="text-[34px] font-bold leading-none tabular-nums text-ink">{total}</div>
                <div className="text-xs font-semibold text-stone-500">of 36</div>
              </div>
            </div>
            <div>
              <b className="text-lg text-ink">{verdict}</b>
              <p className="mt-1 max-w-[50ch] text-[13.5px] text-stone-600">
                Ashtakoota guna milan adds up eight kootas. 18 or more is traditionally considered acceptable.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {KOOTAS.map((k, i) => (
              <div key={k.name} className="rounded-xl bg-cream px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[13.5px] text-ink">{k.name}</b>
                  <span className="text-[13px] font-bold tabular-nums text-ink">
                    {result.scores[i]} / {k.max}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eee7db]">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${(result.scores[i] / k.max) * 100}%` }} />
                </div>
                <div className="mt-1 text-[11.5px] text-stone-500">{k.about}</div>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </>
  );
}

// ---------- Panchang ----------

function PanchangTool({ tool }: { tool: Tool }) {
  const [date, setDate] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  const rows = shown
    ? (() => {
        const d = new Date(`${shown}T00:00:00`);
        const day = Math.floor(d.getTime() / 86400000);
        const month = d.getMonth();
        const sunrise = ["7:08", "6:58", "6:36", "6:12", "5:52", "5:46", "5:54", "6:06", "6:14", "6:20", "6:34", "6:54"][month];
        const sunset = ["6:02", "6:20", "6:32", "6:42", "6:54", "7:06", "7:08", "6:56", "6:32", "6:08", "5:48", "5:46"][month];
        return [
          ["Tithi", `${(Math.floor(day / 15) % 2 === 0 ? "Shukla" : "Krishna")} ${TITHIS[day % 15]}`],
          ["Nakshatra", NAKSHATRAS[day % 27]],
          ["Yoga", YOGAS[day % YOGAS.length]],
          ["Karana", KARANAS[day % KARANAS.length]],
          ["Sunrise", `${sunrise} am`],
          ["Sunset", `${sunset} pm`],
          ["Rahu Kaal", RAHU_KAAL[d.getDay()]],
        ];
      })()
    : [];

  return (
    <>
      <FormCard title="Pick a date" submitLabel="Show Panchang" onSubmit={() => setShown(date)}>
        <Field label="Date">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
      </FormCard>

      {shown && (
        <ResultCard
          tool={tool}
          title={new Date(`${shown}T00:00:00`).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-[14px] bg-cream px-3.5 py-[13px]">
                <div className="text-[11px] font-semibold text-stone-500">{label}</div>
                <b className="mt-[3px] block text-base font-bold text-ink">{value}</b>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Timings shown for New Delhi (IST).</p>
        </ResultCard>
      )}
    </>
  );
}

// ---------- Numerology ----------

const LETTER_VALUES = "abcdefghijklmnopqrstuvwxyz";

function reduceNumber(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
}

function NumerologyTool({ tool }: { tool: Tool }) {
  const [form, setForm] = useState({ name: "", date: "" });
  const [result, setResult] = useState<{ name: string; lifePath: number; destiny: number } | null>(null);

  function calculate() {
    const digits = form.date.replace(/\D/g, "").split("").map(Number);
    const lifePath = reduceNumber(digits.reduce((a, b) => a + b, 0));
    const letters = form.name.toLowerCase().replace(/[^a-z]/g, "").split("");
    const destiny = reduceNumber(letters.reduce((sum, ch) => sum + ((LETTER_VALUES.indexOf(ch) % 9) + 1), 0));
    setResult({ name: form.name, lifePath, destiny });
  }

  return (
    <>
      <FormCard title="Your name and birth date" submitLabel="Find my numbers" onSubmit={calculate}>
        <Field label="Full name at birth">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            autoComplete="name"
          />
        </Field>
        <Field label="Date of birth">
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputClass}
          />
        </Field>
      </FormCard>

      {result && (
        <ResultCard tool={tool} title={`${result.name.split(" ")[0]}'s numbers`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Life path number", value: result.lifePath, from: "from your date of birth" },
              { label: "Destiny number", value: result.destiny, from: "from the letters of your name" },
            ].map((n) => (
              <div key={n.label} className="rounded-2xl border border-line-warm bg-card p-5">
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{n.label}</div>
                <div className="mt-1 font-display text-[56px] font-semibold leading-none text-amber-600">{n.value}</div>
                <p className="mt-2 text-[13.5px] leading-normal text-stone-600">{NUMBER_MEANINGS[n.value]}</p>
                <p className="mt-1 text-[11.5px] text-stone-500">Calculated {n.from}</p>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </>
  );
}

// ---------- Tarot ----------

function TarotTool({ tool }: { tool: Tool }) {
  const [cards, setCards] = useState<typeof TAROT_CARDS | null>(null);

  function draw() {
    const deck = [...TAROT_CARDS];
    const picked: typeof TAROT_CARDS = [];
    for (let i = 0; i < 3; i++) picked.push(deck.splice(Math.floor(Math.random() * deck.length), 1)[0]);
    setCards(picked);
  }

  return (
    <>
      <div className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
        <h2 className="font-display text-[26px] font-semibold text-ink">Hold your question in mind</h2>
        <p className="mt-1 max-w-[56ch] text-sm text-stone-600">
          Take a breath, think of one specific question, then draw. Three cards: what led here, where you are, and what
          comes next.
        </p>
        <button type="button" onClick={draw} className="az-cta mt-5 h-12 rounded-full px-6 text-[15px] font-bold">
          {cards ? "Draw again" : "Draw three cards"}
        </button>
      </div>

      {cards && (
        <ResultCard tool={tool} title="Your three cards">
          <div className="grid gap-3 sm:grid-cols-3">
            {cards.map((card, i) => (
              <div
                key={card.name}
                className="az-rise rounded-2xl border border-line-warm bg-linear-180 from-[#fffaf0] to-[#f6edd6] p-5 text-center"
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
                  {["Past", "Present", "What comes next"][i]}
                </div>
                <div className="mx-auto my-3 grid h-24 w-16 place-items-center rounded-lg border-2 border-gold bg-plum text-2xl text-amber-300">
                  ✦
                </div>
                <b className="font-display text-xl font-semibold text-ink">{card.name}</b>
                <p className="mt-1.5 text-[13px] leading-normal text-stone-600">{card.meaning}</p>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </>
  );
}
