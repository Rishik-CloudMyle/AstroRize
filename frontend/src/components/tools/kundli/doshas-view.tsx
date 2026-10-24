import { RASHIS, isoDate, type SadeSati, type SavedChart, type SaturnPhase } from "@/lib/astro";
import { SectionTitle } from "../tool-ui";
import { SECTION_HELP } from "./explain";
import { AskAstrologer, Block, GRAHA_EN, Help, ordinal } from "./shared";

const PHASE: Record<SaturnPhase, string> = {
  rising: "Rising phase (12th from Moon)",
  peak: "Peak phase (over the Moon sign)",
  setting: "Setting phase (2nd from Moon)",
  kantaka: "Kantaka Shani (4th from Moon)",
  ashtama: "Ashtama Shani (8th from Moon)",
};

function Verdict({ tone, children }: { tone: "yes" | "no" | "partial"; children: React.ReactNode }) {
  const cls = { yes: "bg-orange-100 text-orange-900", no: "bg-emerald-100 text-emerald-900", partial: "bg-amber-100 text-amber-900" }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${cls}`}>{children}</span>;
}

/** Doshas tab: Manglik, Kalsarpa and Sade Sati. No remedies (client decision): an astrologer link instead. */
export default function DoshasView({ chart }: { chart: SavedChart }) {
  const k = chart.kundli;
  const m = k.doshas.manglik;
  const ks = k.doshas.kalsarpa;
  const tz = k.birth.timezone;
  return (
    <div className="grid gap-6">
      <section aria-labelledby="k-manglik">
        <SectionTitle>
          <span id="k-manglik">Manglik (Mangal dosha)</span>
        </SectionTitle>
        <Help className="-mt-1 mb-3">{SECTION_HELP.manglik}</Help>
        <Block>
          <div className="flex flex-wrap items-center gap-2">
            <Verdict tone={m.present ? "yes" : "no"}>{m.present ? "Manglik" : "Not Manglik"}</Verdict>
            <span className="text-[13px] text-stone-600">
              Mars in {m.marsSign.name}: {m.fromLagna !== null ? `${ordinal(m.fromLagna)} house from the lagna, ` : ""}
              {ordinal(m.fromMoon)} from the Moon.
            </span>
          </div>
          <ul className="mt-3 grid gap-1 text-[13px] text-stone-700">
            <li>
              From the lagna:{" "}
              <b className="text-ink">{m.fromLagna !== null && [1, 2, 4, 7, 8, 12].includes(m.fromLagna) ? "present" : "not present"}</b>
            </li>
            <li>
              From the Moon: <b className="text-ink">{[1, 2, 4, 7, 8, 12].includes(m.fromMoon) ? "present" : "not present"}</b>
            </li>
          </ul>
          {m.present && m.cancellations.length > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
              <b>Traditional cancellations that apply:</b>
              <ul className="mt-1 list-disc pl-5">
                {m.cancellations.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[12.5px] text-stone-500">
            The same rule as our Kundli matching. Many families weigh it only together with the partner&apos;s chart.
          </p>
          <div className="mt-2">
            <AskAstrologer />
          </div>
        </Block>
      </section>

      <section aria-labelledby="k-kalsarpa">
        <SectionTitle>
          <span id="k-kalsarpa">Kalsarpa</span>
        </SectionTitle>
        <Help className="-mt-1 mb-3">{SECTION_HELP.kalsarpa}</Help>
        <Block>
          <div className="flex flex-wrap items-center gap-2">
            <Verdict tone={ks.status === "present" ? "yes" : ks.status === "partial" ? "partial" : "no"}>
              {ks.status === "present" ? `${ks.type} Kalsarpa` : ks.status === "partial" ? `Partial ${ks.type} Kalsarpa` : "No Kalsarpa"}
            </Verdict>
            <span className="text-[13px] text-stone-600">Rahu in the {ordinal(ks.rahuHouse)} house.</span>
          </div>
          <p className="mt-2 text-[13px] text-stone-700">
            {ks.status === "present"
              ? `All seven planets lie ${ks.direction === "rahu-to-ketu" ? "from Rahu to Ketu" : "from Ketu to Rahu (sometimes called Kalamrita)"} in zodiac order.`
              : ks.status === "partial"
                ? `The planets are hemmed in except ${ks.outside.map((g) => GRAHA_EN[g]).join(", ")}, which share${ks.outside.length === 1 ? "s" : ""} a sign with a node, so the pattern is incomplete.`
                : `${ks.outside.map((g) => GRAHA_EN[g]).join(", ")} ${ks.outside.length === 1 ? "lies" : "lie"} on the other side of the Rahu–Ketu axis, so the planets are not hemmed in.`}
          </p>
          <p className="mt-2 text-[12.5px] text-stone-500">
            Checked by longitude. The type is named after Rahu&apos;s house: Anant (1st) … Sheshnag (12th).
          </p>
          {ks.status !== "absent" && (
            <div className="mt-2">
              <AskAstrologer />
            </div>
          )}
        </Block>
      </section>

      <SadeSatiBlock s={chart.today.sadeSati} moonSign={k.moonSign.name} tz={tz} />
    </div>
  );
}

function SadeSatiBlock({ s, moonSign, tz }: { s: SadeSati; moonSign: string; tz: string }) {
  const now = s.at;
  const date = (iso: string) => isoDate(iso, tz);
  return (
    <section aria-labelledby="k-sadesati">
      <SectionTitle>
        <span id="k-sadesati">Sade Sati</span>
      </SectionTitle>
      <Help className="-mt-1 mb-3">{SECTION_HELP.sadeSati}</Help>
      <Block>
        <div className="flex flex-wrap items-center gap-2">
          <Verdict tone={s.current?.kind === "sade-sati" ? "yes" : s.current ? "partial" : "no"}>
            {s.current ? (s.current.kind === "sade-sati" ? "Sade Sati now" : "Dhaiya now") : "No Sade Sati now"}
          </Verdict>
          <span className="text-[13px] text-stone-600">
            Moon sign {moonSign}; Saturn is in {RASHIS[s.saturnSign]!.en} today.
          </span>
        </div>
        {s.current && (
          <p className="mt-2 text-[13px] text-stone-700">
            Now: <b className="text-ink">{PHASE[s.current.phase]}</b>. This {s.current.kind === "sade-sati" ? "Sade Sati" : "Dhaiya"} runs{" "}
            {date(s.current.since)} – {date(s.current.until)}.
          </p>
        )}

        <h4 className="mt-4 text-[13px] font-bold uppercase tracking-[.06em] text-amber-900">Periods</h4>
        {s.periods.length === 0 ? (
          <p className="mt-1 text-[13px] text-stone-600">None in this window.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5">
            {s.periods.map((p) => {
              const on = p.start <= now && now < p.end;
              const past = p.end <= now;
              return (
                <li key={p.start} className={`rounded-xl border px-3 py-2 ${on ? "border-amber-300 bg-amber-50" : "border-line-warm bg-white"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b className={`text-[13.5px] ${past ? "text-stone-500" : "text-ink"}`}>
                      {p.kind === "sade-sati" ? "Sade Sati" : "Dhaiya (small panoti)"}
                      {on && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-ink">Now</span>}
                    </b>
                    <span className="text-[12.5px] tabular-nums text-stone-600">
                      {p.openStart ? "before " : ""}
                      {date(p.start)} – {date(p.end)}
                      {p.openEnd ? " or later" : ""}
                    </span>
                  </div>
                  {p.spans.length > 1 && (
                    <ul className="mt-1 grid gap-0.5 text-[12px] text-stone-600">
                      {p.spans.map((x) => (
                        <li key={x.start} className="flex flex-wrap justify-between gap-x-3">
                          <span>
                            {PHASE[x.phase]} · Saturn in {RASHIS[x.sign]!.en}
                          </span>
                          <span className="tabular-nums">
                            {date(x.start)} – {date(x.end)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.spans.length === 1 && <p className="mt-0.5 text-[12px] text-stone-600">{PHASE[p.spans[0]!.phase]}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[12.5px] text-stone-500">
          From your birth (or 30 years back) to 30 years ahead. Saturn&apos;s retrograde loops can split a period into parts. Dates in the
          birthplace&apos;s time zone.
        </p>
        <div className="mt-2">
          <AskAstrologer />
        </div>
      </Block>
    </section>
  );
}
