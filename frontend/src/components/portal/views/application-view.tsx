"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { ageChip, buildWizardSteps } from "@/lib/portal/application-steps";
import { BIO_WORD_LIMIT, hasClaimWarning, wordCount } from "@/lib/portal/bio";
import { LIFECYCLE } from "@/lib/portal/lifecycle";
import type { ApplicationDraft, WizardField } from "@/lib/portal/types";
import { useAccount, useErrorToast, usePortalState, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";

function chipColors(chip: string): { bg: string; fg: string } {
  if (chip === "Rejected" || chip === "Required") return { bg: "#fff1f2", fg: "#be123c" };
  if (chip === "Uploading" || chip === "Pending") return { bg: "#eff6ff", fg: "#1d4ed8" };
  return { bg: "#ecfdf5", fg: "#047857" };
}

/** Edits are saved this long after the last keystroke. */
const AUTOSAVE_MS = 800;

const STAGES = LIFECYCLE;

export default function ApplicationView({ data }: { data: ApplicationDraft }) {
  const { astrologer: me, status } = useAccount();
  const toast = useToast();
  const showError = useErrorToast();
  const steps = useMemo(() => buildWizardSteps(data.known), [data.known]);
  const last = steps.length - 1;
  const [step, setStep] = useState(Math.max(0, Math.min(last, data.currentStep)));
  const [edits, setEdits] = useState<Record<string, string>>(data.values);
  const [savedLabel, setSavedLabel] = useState(data.lastSaved);
  const [bio] = usePortalState("bio", me.bio);

  // Auto-save: the latest step and edits go to the API shortly after each change.
  const pending = useRef<{ currentStep: number; values: Record<string, string> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    if (!body) return true;
    pending.current = null;
    try {
      const res = await api.put<{ lastSaved: string }>("/portal/application", body);
      setSavedLabel(res.lastSaved);
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }, [showError]);

  const queueSave = (currentStep: number, values: Record<string, string>, delay = AUTOSAVE_MS) => {
    pending.current = { currentStep, values };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  // Leaving the page saves anything still waiting.
  useEffect(() => () => void flush(), [flush]);

  const idx = Math.max(0, Math.min(last, step));
  const current = steps[idx];

  const fields: WizardField[] = current.fields.map((f, i) => {
    // Step 9's bio row is a live readout of the bio being edited on the Profile page.
    if (current.short === "Bio" && i === 0) {
      return { ...f, value: `${wordCount(bio)} / ${BIO_WORD_LIMIT} words`, chip: hasClaimWarning(bio) ? "1 warning" : "no warnings" };
    }
    if (f.label === "Date of birth") return { ...f, chip: ageChip(edits[`${idx}-${i}`] ?? f.value) };
    return f;
  });

  const edit = (key: string, value: string) => {
    const nextValues = { ...edits, [key]: value };
    setEdits(nextValues);
    queueSave(idx, nextValues);
  };

  const goTo = (i: number) => {
    setStep(i);
    queueSave(i, edits, 0);
  };

  const saveNow = async () => {
    pending.current = { currentStep: idx, values: edits };
    if (await flush()) toast("Draft saved. You can resume from the dashboard at any time before it expires.");
  };

  const next = () => {
    if (idx === last) {
      toast(
        status.lifecycle === "active"
          ? "Your application has already been approved — there is nothing to resubmit."
          : "Application submitted. The banner at the top of the portal now shows its progress.",
      );
      return;
    }
    goTo(idx + 1);
  };

  const currentStage = STAGES.find((s) => s.key === status.lifecycle);

  return (
    <div>
      <PageHeader title="Application" subtitle="Thirteen steps. Every step auto-saves; you can leave and resume.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center rounded-full bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
            {savedLabel}
          </span>
          <button
            type="button"
            onClick={saveNow}
            className="h-[38px] rounded-xl border border-line bg-white px-[15px] text-[13.5px] font-bold"
          >
            Save &amp; resume later
          </button>
        </div>
      </PageHeader>

      <div className="mt-5 grid grid-cols-4 gap-x-[3px] gap-y-2.5 min-[480px]:flex min-[480px]:flex-wrap min-[480px]:gap-[3px]">
        {steps.map((s, i) => {
          const bar = i < idx ? "#f59e0b" : i === idx ? "#d97706" : "#e7e0d6";
          const fg = i === idx ? "#92400e" : i < idx ? "#57534e" : "#a8a29e";
          return (
            <button
              key={s.short}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === idx ? "step" : undefined}
              className="min-w-0 text-left min-[480px]:min-w-16 min-[480px]:flex-1"
            >
              <span className="block h-1 rounded-full" style={{ background: bar }} />
              <span
                className="mt-1.5 block truncate text-[10.5px]"
                style={{ color: fg, fontWeight: i === idx ? 700 : 500 }}
              >
                {i + 1}. {s.short}
              </span>
            </button>
          );
        })}
      </div>

      <Panel className="mt-[22px] p-[18px] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[20px] font-bold">{current.title}</h2>
          <span className="text-[12.5px] text-stone-500">
            Step {idx + 1} of {steps.length}
          </span>
        </div>
        <p className="mt-1.5 mb-5 max-w-[72ch] text-[13.5px] leading-[1.55] text-stone-600">{current.blurb}</p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5">
          {fields.map((f, i) => {
            const key = `${idx}-${i}`;
            // The bio row is a readout of the Profile page's bio, not a field of its own.
            const typable = current.typable && !f.readOnly && !(current.short === "Bio" && i === 0);
            const value = edits[key] ?? f.value;
            const bg = f.readOnly ? "#f5f5f4" : f.error ? "#fff1f2" : "#fff";
            const border = f.error ? "#fecdd3" : "#e7e0d6";
            const fg = f.readOnly ? "#78716c" : f.error ? "#be123c" : "#1c1917";
            const chip = f.chip ? chipColors(f.chip) : null;
            const inputId = `wiz-${key}`;
            return (
              <div key={key}>
                <label htmlFor={typable ? inputId : undefined} className="mb-1.5 block text-xs font-semibold text-stone-600">
                  {f.label}
                </label>
                <div
                  className="flex min-h-[50px] items-center gap-2.5 rounded-xl border px-3.5"
                  style={{ background: bg, borderColor: border }}
                >
                  {typable ? (
                    <input
                      id={inputId}
                      value={value}
                      placeholder={f.placeholder}
                      onChange={(e) => edit(key, e.target.value)}
                      className="min-w-0 flex-1 bg-transparent py-[13px] text-[14.5px] text-ink outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ color: fg }}>
                      {value}
                    </span>
                  )}
                  {f.chip && chip && (
                    <span
                      className="inline-flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[10.5px] font-extrabold"
                      style={{ background: chip.bg, color: chip.fg }}
                    >
                      {f.chip}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-[18px] rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px] text-[13px] leading-[1.5] text-blue-800">
          {current.note}
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, idx - 1))}
            className="h-[46px] rounded-xl border border-line bg-white px-5 text-[14.5px] font-bold text-ink"
          >
            Back
          </button>
          <button type="button" onClick={next} className="az-cta h-[46px] rounded-xl px-[26px] text-[14.5px] font-bold">
            {idx === last ? "Submit application" : "Next"}
          </button>
        </div>
      </Panel>

      <Panel warm className="mt-4 p-[22px]">
        <h2 className="m-0 mb-1 text-base font-bold">After you submit</h2>
        <p className="mb-3.5 text-[12.5px] text-stone-500">
          The banner at the top of the portal always shows which of these stages your account is in.
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Application stages">
          {STAGES.map((l) => {
            const on = l.key === currentStage?.key;
            return (
              <li
                key={l.key}
                aria-current={on ? "step" : undefined}
                className={`inline-flex h-[34px] items-center rounded-full border px-[13px] text-[12.5px] font-bold ${
                  on ? "border-ink bg-ink text-amber-300" : "border-line bg-white text-stone-600"
                }`}
              >
                {l.label}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
