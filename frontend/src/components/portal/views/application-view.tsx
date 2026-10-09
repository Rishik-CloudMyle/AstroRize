"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { api } from "@/lib/api/client";
import { ageChip, buildWizardSteps } from "@/lib/portal/application-steps";
import { BIO_WORD_LIMIT, hasClaimWarning, wordCount } from "@/lib/portal/bio";
import { LIFECYCLE } from "@/lib/portal/lifecycle";
import type { ApplicationDraft, ApplicationMissing, WizardField } from "@/lib/portal/types";
import { useAccount, useErrorToast, usePortalState, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";

function chipColors(chip: string): { bg: string; fg: string } {
  if (chip === "Rejected" || chip === "Required" || / to finish$/.test(chip)) return { bg: "#fff1f2", fg: "#be123c" };
  if (chip === "Uploading" || chip === "Pending" || chip === "Later") return { bg: "#eff6ff", fg: "#1d4ed8" };
  return { bg: "#ecfdf5", fg: "#047857" };
}

/** Edits are saved this long after the last keystroke. */
const AUTOSAVE_MS = 800;

const STAGES = LIFECYCLE;

export default function ApplicationView({ data }: { data: ApplicationDraft }) {
  const { astrologer: me, status } = useAccount();
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const steps = useMemo(() => buildWizardSteps(data.known), [data.known]);
  const last = steps.length - 1;
  const [step, setStep] = useState(Math.max(0, Math.min(last, data.currentStep)));
  const [edits, setEdits] = useState<Record<string, string>>(data.values);
  const [savedLabel, setSavedLabel] = useState(data.lastSaved);
  const [bio] = usePortalState("bio", me.bio);
  // What the API says still stops the application going to HR; re-checked on the last step.
  const [missing, setMissing] = useState<ApplicationMissing[]>(data.missing);
  const [submitting, setSubmitting] = useState(false);
  // After submitting, the page stays busy until the banner and answers show the new state.
  const [refreshing, startRefresh] = useTransition();
  const sending = submitting || refreshing;
  // Once it is with HR the answers are shown as sent; they open again only when HR asks for more.
  const editable = data.editable;
  const resubmit = editable && status.lifecycle === "docs";

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
    if (!editable) return;
    pending.current = { currentStep, values };
    if (timer.current) clearTimeout(timer.current);
    // On the last step the "finish these" list is re-checked after each save, so it never goes stale.
    timer.current = setTimeout(() => void (currentStep === last ? recheck(currentStep, values) : flush()), delay);
  };

  // Leaving the page saves anything still waiting.
  useEffect(() => () => void flush(), [flush]);

  /** Saves what is waiting, then asks the API what is still missing. */
  const recheck = useCallback(
    async (currentStep: number, values: Record<string, string>): Promise<ApplicationMissing[] | null> => {
      if (editable) pending.current = { currentStep, values };
      if (!(await flush())) return null;
      try {
        const res = await api.get<{ application: ApplicationDraft }>("/portal/application");
        setMissing(res.application.missing);
        return res.application.missing;
      } catch (e) {
        showError(e);
        return null;
      }
    },
    [editable, flush, showError],
  );

  const idx = Math.max(0, Math.min(last, step));
  const current = steps[idx];
  const missingSteps = new Set(missing.filter((m) => m.step < last).map((m) => m.step));

  const fields: WizardField[] = current.fields.map((f, i) => {
    // Step 9's bio row is a live readout of the bio being edited on the Profile page.
    if (current.short === "Bio" && i === 0) {
      return { ...f, value: `${wordCount(bio)} / ${BIO_WORD_LIMIT} words`, chip: hasClaimWarning(bio) ? "1 warning" : "no warnings" };
    }
    if (f.label === "Date of birth") return { ...f, chip: ageChip(edits[`${idx}-${i}`] ?? f.value) };
    if (f.label === "Steps complete") {
      if (!editable) return { ...f, value: "Sent to HR" };
      const done = last - missingSteps.size;
      return { ...f, value: `${done} of ${last}`, chip: missingSteps.size ? `${missingSteps.size} to finish` : "Ready" };
    }
    return f;
  });

  const edit = (key: string, value: string) => {
    const nextValues = { ...edits, [key]: value };
    setEdits(nextValues);
    queueSave(idx, nextValues);
  };

  const goTo = (i: number) => {
    setStep(i);
    if (i === last) void recheck(i, edits);
    else queueSave(i, edits, 0);
  };

  const saveNow = async () => {
    pending.current = { currentStep: idx, values: edits };
    if (await flush()) toast("Draft saved. You can come back and continue at any time.");
  };

  const submit = async () => {
    if (sending) return;
    setSubmitting(true);
    try {
      const left = await recheck(idx, edits);
      if (!left) return;
      if (left.length) {
        toast(`${left.length === 1 ? "One thing needs" : `${left.length} things need`} finishing before you can submit — see the list below.`);
        return;
      }
      const res = await api.post<{ alreadySubmitted: boolean }>("/portal/application/submit");
      toast(
        res.alreadySubmitted
          ? "Your application is already with HR."
          : resubmit
            ? "Update sent. HR will review your application again."
            : "Application submitted. HR will review it — the banner at the top shows where it stands.",
      );
      // The banner and this page read the new state from the API.
      startRefresh(() => router.refresh());
    } catch (e) {
      showError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (idx === last) void submit();
    else goTo(idx + 1);
  };

  const currentStage = STAGES.find((s) => s.key === status.lifecycle);

  return (
    <div>
      <PageHeader
        title="Application"
        subtitle={
          editable
            ? "Thirteen steps. Every step auto-saves; you can leave and resume."
            : "Your application as you sent it to HR."
        }
      >
        {editable && (
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
        )}
      </PageHeader>

      {!editable && <SentNotice lifecycle={status.lifecycle} submittedOn={data.submittedOn} note={data.note} />}

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
            const typable = editable && current.typable && !f.readOnly && !(current.short === "Bio" && i === 0);
            const value = edits[key] ?? f.value;
            const bg = f.readOnly ? "#f5f5f4" : f.error ? "#fff1f2" : "#fff";
            const border = f.error ? "#fecdd3" : "#e7e0d6";
            const fg = f.readOnly ? "#78716c" : f.error ? "#be123c" : "#1c1917";
            const chip = f.chip ? chipColors(f.chip) : null;
            const inputId = `wiz-${key}`;
            if (f.check) {
              const ticked = value === "yes";
              return (
                <div key={key}>
                  <span className="mb-1.5 block text-xs font-semibold text-stone-600">{f.label}</span>
                  <label
                    htmlFor={inputId}
                    className="flex min-h-[50px] items-center gap-2.5 rounded-xl border px-3.5"
                    style={{ background: ticked ? "#ecfdf5" : "#fff", borderColor: ticked ? "#a7f3d0" : "#e7e0d6" }}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={ticked}
                      disabled={!typable}
                      aria-label={f.label === "Accuracy confirmation" ? f.label : `${f.label}: I confirm`}
                      onChange={(e) => edit(key, e.target.checked ? "yes" : "")}
                      className="h-[18px] w-[18px] shrink-0 accent-amber-600"
                    />
                    <span className="min-w-0 flex-1 text-[14.5px] text-ink">
                      {f.label === "Accuracy confirmation" ? "I confirm these details are accurate" : "I confirm"}
                    </span>
                  </label>
                </div>
              );
            }
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
                      {value || "—"}
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

        {idx === last && editable && missing.length > 0 && (
          <div className="mt-[18px] rounded-[14px] border border-rose-200 bg-rose-50 px-[15px] py-[13px]" role="alert">
            <b className="block text-[13.5px] text-rose-800">Finish these before you submit</b>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {missing.map((m) => (
                <li key={`${m.step}-${m.label}`}>
                  <button
                    type="button"
                    onClick={() => goTo(m.step)}
                    className="border-0 bg-transparent p-0 text-left text-[13px] leading-[1.45] text-rose-800 underline-offset-2 hover:underline"
                  >
                    <span className="font-bold">Step {m.step + 1}</span> · {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-[18px] rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px] text-[13px] leading-[1.5] text-blue-800">
          {current.note}
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, idx - 1))}
            disabled={idx === 0}
            className="h-[46px] rounded-xl border border-line bg-white px-5 text-[14.5px] font-bold text-ink disabled:opacity-50"
          >
            Back
          </button>
          {(idx < last || editable) && (
            <button
              type="button"
              onClick={next}
              disabled={sending}
              className="az-cta h-[46px] rounded-xl px-[26px] text-[14.5px] font-bold disabled:opacity-60"
            >
              {idx < last ? "Next" : sending ? "Sending…" : resubmit ? "Send updated application" : "Submit application"}
            </button>
          )}
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

/** Shown above the read-only answers once the application has gone to HR. */
function SentNotice({ lifecycle, submittedOn, note }: { lifecycle: string; submittedOn: string | null; note: string | null }) {
  const sent = submittedOn ? `Submitted on ${submittedOn}.` : "Submitted.";
  if (lifecycle === "rejected") {
    return (
      <div className="mt-5 rounded-[14px] border border-rose-200 bg-rose-50 px-[15px] py-[13px] text-[13.5px] leading-[1.5] text-rose-800" role="status">
        <b>{sent} HR did not approve this application.</b>
        {note && <span className="mt-1 block">Reason: {note}</span>}
      </div>
    );
  }
  if (lifecycle === "active") {
    return (
      <div className="mt-5 rounded-[14px] border border-emerald-200 bg-emerald-50 px-[15px] py-[13px] text-[13.5px] leading-[1.5] text-emerald-800" role="status">
        <b>{sent} Your application has been approved.</b> You can go online from the dashboard.
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px] text-[13.5px] leading-[1.5] text-blue-800" role="status">
      <b>{sent}</b> Your answers can&apos;t be changed while HR reviews them. If HR needs anything else, this page opens again
      for you to update it.
    </div>
  );
}
