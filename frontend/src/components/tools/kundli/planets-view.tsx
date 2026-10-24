import { DIGNITY_LABEL, type Dignity, type Kundli, type ZodiacPoint } from "@/lib/astro";
import { SectionTitle, tdClass, thClass } from "../tool-ui";
import { SECTION_HELP } from "./explain";
import { GRAHA_EN, Help, RetroBadge } from "./shared";

interface Row {
  key: string;
  abbr: string;
  name: string;
  point: ZodiacPoint;
  house: number;
  bhava: number;
  retrograde: boolean;
  combust: boolean | null;
  dignity: Dignity | null;
  isNode: boolean;
}

const DIGNITY_TONE: Record<Dignity, string> = {
  exalted: "bg-emerald-50 text-emerald-800",
  moolatrikona: "bg-emerald-50 text-emerald-800",
  own: "bg-emerald-50 text-emerald-800",
  friend: "bg-amber-50 text-amber-900",
  neutral: "bg-stone-100 text-stone-700",
  enemy: "bg-orange-50 text-orange-800",
  debilitated: "bg-rose-50 text-rose-800",
};

function Status({ r }: { r: Row }) {
  if (r.key === "lagna") return <span className="text-stone-400">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {r.dignity ? (
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${DIGNITY_TONE[r.dignity]}`}>{DIGNITY_LABEL[r.dignity]}</span>
      ) : (
        <span className="text-stone-400" title="No agreed dignity for the nodes">
          —
        </span>
      )}
      {r.combust && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11.5px] font-bold text-orange-900">Combust</span>}
    </span>
  );
}

/** Planets tab: full planet table (cards on phones) and the twelve houses. */
export default function PlanetsView({ k }: { k: Kundli }) {
  const rows: Row[] = [
    { key: "lagna", abbr: "As", name: "Ascendant", point: k.lagna, house: 1, bhava: 1, retrograde: false, combust: null, dignity: null, isNode: false },
    ...k.grahas.map((g) => ({
      key: g.key,
      abbr: g.abbr,
      name: g.name,
      point: g as ZodiacPoint,
      house: g.house,
      bhava: g.bhava,
      retrograde: g.retrograde,
      combust: g.combust,
      dignity: g.dignity,
      isNode: g.key === "rahu" || g.key === "ketu",
    })),
  ];
  return (
    <div>
      <SectionTitle>Planetary positions</SectionTitle>
      <Help className="-mt-1 mb-4">{SECTION_HELP.planets}</Help>

      <div className="hidden overflow-x-auto rounded-2xl border border-line-warm bg-white md:block">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thClass}>Planet</th>
              <th className={thClass}>Sign</th>
              <th className={thClass}>Sign lord</th>
              <th className={thClass}>Degree</th>
              <th className={thClass}>Nakshatra</th>
              <th className={thClass}>Nak. lord</th>
              <th className={`${thClass} text-right`}>House</th>
              <th className={`${thClass} text-right`}>Chalit</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.key === "lagna" ? "bg-amber-50/60" : "hover:bg-[#fffaf0]"}>
                <td className={`${tdClass} whitespace-nowrap font-semibold text-ink`}>
                  {r.name}
                  {r.retrograde && <RetroBadge />}
                </td>
                <td className={tdClass}>{r.point.sign.name}</td>
                <td className={tdClass}>{GRAHA_EN[r.point.sign.lord]}</td>
                <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{r.point.dms}</td>
                <td className={tdClass}>
                  {r.point.nakshatra.name} <span className="text-stone-500">· {r.point.nakshatra.pada}</span>
                </td>
                <td className={tdClass}>{GRAHA_EN[r.point.nakshatra.lord]}</td>
                <td className={`${tdClass} text-right font-semibold tabular-nums text-ink`}>{r.house}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{r.bhava}</td>
                <td className={tdClass}>
                  <Status r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className={`rounded-2xl border px-3 py-2.5 ${r.key === "lagna" ? "border-amber-200 bg-amber-50/70" : "border-line-warm bg-white"}`}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[#d6a84a] bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#f6e3b4)] text-[12px] font-bold text-amber-900"
              >
                {r.abbr}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="text-[14.5px] text-ink">
                    {r.name}
                    {r.retrograde && <RetroBadge />}
                  </b>
                  <span className="shrink-0 text-[12.5px] font-semibold text-stone-600">
                    House {r.house}
                    {r.bhava !== r.house ? <span className="font-normal text-stone-500"> · Chalit {r.bhava}</span> : null}
                  </span>
                </div>
                <div className="text-[13px] text-stone-700">
                  {r.point.sign.name} <span className="tabular-nums text-stone-500">· {r.point.dms}</span>
                  <span className="text-stone-500"> · lord {GRAHA_EN[r.point.sign.lord]}</span>
                </div>
                <div className="text-[12px] text-stone-500">
                  {r.point.nakshatra.name} pada {r.point.nakshatra.pada} · lord {GRAHA_EN[r.point.nakshatra.lord]}
                </div>
              </div>
            </div>
            {r.key !== "lagna" && (
              <div className="mt-1.5 pl-12">
                <Status r={r} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[12px] leading-normal text-stone-500">
        House is whole-sign from the lagna; Chalit is the Sripati bhava. Status: dignity by sign (natural friendship with the sign lord); Rahu and
        Ketu have no agreed dignity, so none is shown. Combust: within the classical distance of the Sun (Moon 12°, Mars 17°, Mercury 14° or
        12° retrograde, Jupiter 11°, Venus 10° or 8° retrograde, Saturn 15°).
        {k.settings.node === "mean" ? " Rahu and Ketu use the mean nodes, which always move backwards." : " Rahu and Ketu use the true node."}
      </p>

      <SectionTitle className="mt-8">Houses</SectionTitle>
      <ul className="grid gap-1 rounded-2xl border border-line-warm bg-white px-3 py-3 text-[13px] sm:grid-cols-2">
        {k.houses.map((h) => (
          <li key={h.house} className="flex min-w-0 gap-2 rounded-lg px-1.5 py-1">
            <b className="w-6 shrink-0 tabular-nums text-ink">{h.house}</b>
            <span className="min-w-0 text-stone-600">
              <span className="font-semibold text-stone-800">{h.sign.name}</span> · lord {GRAHA_EN[h.sign.lord]}
              {h.grahas.length > 0 ? <span className="text-stone-500"> · {h.grahas.map((g) => GRAHA_EN[g]).join(", ")}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
