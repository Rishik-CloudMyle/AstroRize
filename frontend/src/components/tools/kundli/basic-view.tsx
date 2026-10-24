import { longDate, type SavedChart } from "@/lib/astro";
import { SectionTitle } from "../tool-ui";
import { SECTION_HELP } from "./explain";
import { Block, FactList, GRAHA_EN, Help, coordsDms, fmtDms, ordinal, stampSeconds } from "./shared";

/** Basic tab: birth details, the panchang at the birth moment and the avakhada chakra. */
export default function BasicView({ chart }: { chart: SavedChart }) {
  const k = chart.kundli;
  const tz = k.birth.timezone;
  const p = k.birthPanchang;
  const a = k.avakhada;
  const [h, m] = k.birth.time.split(":").map(Number);
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="k-birth">
        <SectionTitle>
          <span id="k-birth">Birth details</span>
        </SectionTitle>
        <Help className="-mt-1 mb-2">{SECTION_HELP.birth}</Help>
        <Block>
          <FactList
            rows={[
              { term: "Name", value: chart.input.name },
              { term: "Date of birth", value: longDate(k.birth.date) },
              { term: "Time of birth", value: `${time} (local clock time)` },
              { term: "Place of birth", value: chart.input.place.name },
              { term: "Latitude, longitude", value: coordsDms(k.birth.latitude, k.birth.longitude) },
              { term: "Time zone", value: `${tz} · ${k.birth.utcOffset} at birth` },
              { term: "Ayanamsa", value: `${k.settings.ayanamsa} ${fmtDms(k.settings.ayanamsaDegrees)}` },
              { term: "Sunrise", value: p.sunrise ? stampSeconds(p.sunrise, tz) : "No sunrise that day" },
              { term: "Sunset", value: p.sunset ? stampSeconds(p.sunset, tz) : "No sunset that day" },
              { term: "Rahu / Ketu", value: k.settings.node === "true" ? "True node" : "Mean node" },
              { term: "Houses", value: "Whole sign from the lagna" },
              { term: "Ascendant", value: `${k.lagna.sign.name} ${k.lagna.dms} · lord ${GRAHA_EN[k.lagna.sign.lord]}` },
            ]}
          />
        </Block>
      </section>

      <section aria-labelledby="k-panchang">
        <SectionTitle>
          <span id="k-panchang">Panchang at birth</span>
        </SectionTitle>
        <Help className="-mt-1 mb-2">
          {SECTION_HELP.panchang} These are read at the exact birth moment, not at sunrise.
        </Help>
        <Block>
          <FactList
            rows={[
              { term: "Tithi", value: `${p.tithi.paksha} ${p.tithi.name}`, help: SECTION_HELP.tithi },
              {
                term: "Vara (weekday)",
                value: `${p.vara.name} (${p.vara.sanskrit})`,
                help: p.vara.beforeSunrise
                  ? `Born before sunrise, so the Vedic weekday is still ${p.vara.name} although the calendar date is a ${p.vara.civil}.`
                  : SECTION_HELP.vara,
              },
              {
                term: "Nakshatra",
                value: `${p.nakshatra.name}, pada ${p.nakshatra.pada} · lord ${GRAHA_EN[p.nakshatra.lord]}`,
                help: SECTION_HELP.nakshatra,
              },
              { term: "Yoga", value: p.yoga.name, help: SECTION_HELP.yoga },
              { term: "Karana", value: p.karana.name, help: SECTION_HELP.karana },
            ]}
          />
        </Block>
      </section>

      <section aria-labelledby="k-avakhada">
        <SectionTitle>
          <span id="k-avakhada">Avakhada details</span>
        </SectionTitle>
        <Help className="-mt-1 mb-2">{SECTION_HELP.avakhada}</Help>
        <Block>
          <FactList
            rows={[
              { term: "Varna", value: a.varna, help: SECTION_HELP.varna },
              { term: "Vashya", value: a.vashya, help: SECTION_HELP.vashya },
              { term: "Yoni", value: a.yoni, help: SECTION_HELP.yoni },
              { term: "Gana", value: a.gana, help: SECTION_HELP.gana },
              { term: "Nadi", value: a.nadi, help: SECTION_HELP.nadi },
              { term: "Moon sign", value: `${a.moonSign.name} (${a.moonSign.sanskrit}) · lord ${GRAHA_EN[a.moonSign.lord]}`, help: SECTION_HELP.sign },
              { term: "Nakshatra charan", value: `${a.nakshatra.name}, pada ${a.charan}`, help: SECTION_HELP.charan },
              { term: "Tatva", value: a.tatva, help: SECTION_HELP.tatva },
              {
                term: "Name alphabet",
                value: (
                  <>
                    {a.nameAlphabet.latin} <span lang="hi">({a.nameAlphabet.devanagari})</span>
                  </>
                ),
                help: SECTION_HELP.nameAlphabet,
              },
              { term: "Paya", value: `${a.paya} (Moon in the ${ordinal(a.moonHouse)} house)`, help: SECTION_HELP.paya },
              { term: "Yunja", value: a.yunja, help: SECTION_HELP.yunja },
            ]}
          />
        </Block>
      </section>
    </div>
  );
}
