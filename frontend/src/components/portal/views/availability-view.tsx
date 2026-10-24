"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { Availability, Slot, SlotState } from "@/lib/portal/types";
import Modal from "../modal";
import { useErrorToast, useToast } from "../portal-provider";
import { ChipRow, Chip } from "../../mobile/chips";
import { M_INPUT, M_LABEL, M_PRIMARY, M_SECONDARY, PageHeader, Panel } from "../ui";
import BookingDialog from "./booking-dialog";

const CELL: Record<SlotState | "unset", { bg: string; border: string; fg: string; label: string }> = {
  booked: { bg: "#f59e0b", border: "#f59e0b", fg: "#1c1917", label: "Booked" },
  open: { bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857", label: "Open" },
  cancelled: { bg: "#f5f5f4", border: "#e7e0d6", fg: "#a8a29e", label: "Cancelled" },
  unset: { bg: "#fffdf8", border: "#efe8dc", fg: "transparent", label: "" },
};

const LEGEND = [
  { label: "Open", bg: "#ecfdf5", border: "#a7f3d0" },
  { label: "Booked", bg: "#f59e0b", border: "#f59e0b" },
  { label: "Cancelled — tap to open again", bg: "#f5f5f4", border: "#e7e0d6" },
  { label: "Unset", bg: "#fffdf8", border: "#efe8dc" },
];

/**
 * ONE definition of slot validity (logic.js → slotProblem). Both the Save button's
 * look and the save handler use it, so they can never disagree.
 */
function slotProblem(slots: Slot[], day: string, start: string, end: string): string | null {
  if (!start || !end) return "Pick a start and an end time.";
  if (end <= start) return "End time must be after start time.";
  const clash = slots.some((x) => x.day === day && x.state !== "cancelled" && x.start < end && start < x.end);
  if (clash) return `That range overlaps a slot you already have on ${day}.`;
  return null;
}

const fieldClass = `h-12 w-full rounded-xl border bg-white text-[15px] text-ink outline-none ${M_INPUT}`;

export default function AvailabilityView({ data }: { data: Availability }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const slots = data.slots;
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [day, setDay] = useState(data.days.includes(data.today) ? data.today : data.days[0]);
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("15:00");
  const formRef = useRef<HTMLDivElement>(null);

  // Bring the form into view when it opens (it sits below the calendar on phones).
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [formOpen, day, start]);

  const problem = slotProblem(slots, day, start, end);
  const valid = problem === null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (problem) {
      toast(problem);
      return;
    }
    const date = data.dayKeys[data.days.indexOf(day)];
    return run(async () => {
      await api.post("/portal/availability", { date, start, end });
      setFormOpen(false);
      toast(`Slot saved as open · ${day} ${start}–${end} IST.`);
    });
  };

  // Cancelling an open slot and opening a cancelled one again both ask first.
  const [confirmSlot, setConfirmSlot] = useState<Slot | null>(null);
  const closeConfirm = useCallback(() => setConfirmSlot(null), []);

  const cancelSlot = (slot: Slot) =>
    run(async () => {
      await api.post(`/portal/availability/${slot.id}/cancel`);
      setConfirmSlot(null);
      toast(`Slot cancelled · ${slot.day} ${slot.start}–${slot.end} IST. Tap it to open it again.`);
    });

  const reopenSlot = (slot: Slot) =>
    run(async () => {
      await api.post(`/portal/availability/${slot.id}/reopen`);
      setConfirmSlot(null);
      toast(`Slot open again · ${slot.day} ${slot.start}–${slot.end} IST.`);
    });

  const clickCell = (d: string, hour: string) => {
    const slot = slots.find((x) => x.day === d && x.state !== "cancelled" && x.start <= hour && hour < x.end) ??
      slots.find((x) => x.day === d && x.start <= hour && hour < x.end);
    const kind = slot?.state ?? null;
    if (slot && (kind === "open" || kind === "cancelled")) return setConfirmSlot(slot);
    if (slot && kind === "booked") {
      // A booking with a real customer opens who booked it; older ones without one say what's booked.
      if (slot.customerName) return setBookingId(slot.id);
      return toast(slot.detail ? `Booked · ${slot.detail}. Cancelling needs a reason.` : data.bookedDetail);
    }
    setDay(d);
    setStart(hour);
    setEnd(hour);
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader title="Availability" subtitle={`${data.weekLabel}. External calendar sync is not available yet.`}>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={`az-cta h-11 rounded-full px-5 text-sm font-bold max-lg:w-full max-lg:bg-none max-lg:shadow-none ${M_PRIMARY}`}
        >
          ＋ Add slot
        </button>
      </PageHeader>

      {/* Phones/tablets: one day at a time — pick a day, then its hours as rows. */}
      <MobileAgenda days={data.days} today={data.today} hours={data.hours} slots={slots} onClick={clickCell} />

      <Panel className="mt-5 overflow-x-auto p-5 max-lg:hidden">
        <div className="grid min-w-[640px] grid-cols-[56px_repeat(7,minmax(74px,1fr))] gap-1">
          <div />
          {data.days.map((d) => {
            const [label, date] = d.split(" ");
            return (
              <div
                key={d}
                className="pb-1.5 text-center text-[11.5px] font-bold"
                style={{ color: d === data.today ? "#b45309" : "#78716c" }}
              >
                {label}
                <br />
                <span className="text-[15px] font-bold">{date}</span>
              </div>
            );
          })}
          {data.hours.map((hour) => (
            <Row key={hour} hour={hour} days={data.days} slots={slots} onClick={clickCell} />
          ))}
        </div>
      </Panel>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 max-lg:hidden">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-[7px] text-[12.5px] font-semibold text-stone-600">
            <span className="size-3.5 rounded-[4px] border" style={{ background: l.bg, borderColor: l.border }} />
            {l.label}
          </span>
        ))}
      </div>

      {formOpen && (
        <div ref={formRef} className="scroll-mb-4 max-lg:scroll-mb-[calc(var(--app-tabbar-space)+16px)]">
          <Panel warm className="mt-[18px] max-w-[520px] p-[22px] max-lg:mt-3.5 max-lg:max-w-none">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[17px] font-bold max-lg:text-[16px]">New slot</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close"
                className="size-[30px] rounded-[9px] bg-cream text-[15px] text-stone-600 max-lg:size-app-hit max-lg:rounded-full max-lg:bg-app-bg"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <div>
                <label htmlFor="slot-day" className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
                  Day
                </label>
                <select id="slot-day" value={day} onChange={(e) => setDay(e.target.value)} className={`${fieldClass} border-line px-3`}>
                  {data.days.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slot-start" className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
                  Start (IST)
                </label>
                <input
                  id="slot-start"
                  value={start}
                  inputMode="numeric"
                  placeholder="HH:MM"
                  onChange={(e) => setStart(e.target.value)}
                  className={`${fieldClass} border-line px-3.5 tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="slot-end" className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
                  End (IST)
                </label>
                <input
                  id="slot-end"
                  value={end}
                  inputMode="numeric"
                  placeholder="HH:MM"
                  aria-invalid={!valid}
                  aria-describedby={valid ? undefined : "slot-error"}
                  onChange={(e) => setEnd(e.target.value)}
                  className={`${fieldClass} px-3.5 tabular-nums`}
                  style={{ borderColor: valid ? "#e7e0d6" : "#be123c" }}
                />
              </div>
            </div>
            {!valid && (
              <div
                id="slot-error"
                className="mt-2.5 flex items-start gap-[9px] rounded-xl border border-rose-200 bg-rose-50 px-[13px] py-[11px]"
              >
                <span className="text-rose-700">✕</span>
                <span className="text-[12.5px] leading-[1.45] text-rose-900">{problem}</span>
              </div>
            )}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className={`h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold ${M_SECONDARY}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="h-11 flex-1 rounded-xl text-sm font-bold max-lg:rounded-app-btn max-lg:text-[15px]"
                style={{ background: valid ? "#f59e0b" : "#fde68a", color: valid ? "#1c1917" : "#78350f" }}
              >
                Save slot
              </button>
            </div>
          </Panel>
        </div>
      )}
      {bookingId && <BookingDialog slotId={bookingId} onClose={() => setBookingId(null)} />}
      {confirmSlot && (
        <SlotConfirm
          slot={confirmSlot}
          slots={slots}
          busy={busy}
          onClose={closeConfirm}
          onConfirm={() => void (confirmSlot.state === "cancelled" ? reopenSlot(confirmSlot) : cancelSlot(confirmSlot))}
        />
      )}
    </div>
  );
}

/**
 * Why a cancelled slot can't be opened again, or null. Same rules as the API: it must not have
 * started yet (times are IST) and no live slot may overlap it now.
 */
function reopenProblem(slot: Slot, slots: Slot[]): string | null {
  if (new Date(`${slot.date}T${slot.start}:00+05:30`).getTime() <= Date.now()) {
    return "This slot has already started or passed, so it can't be opened again. Add a new slot instead.";
  }
  const clash = slots.some((x) => x.id !== slot.id && x.date === slot.date && x.state !== "cancelled" && x.start < slot.end && slot.start < x.end);
  if (clash) return `Another slot on ${slot.day} now overlaps ${slot.start}–${slot.end}. Remove it first or add a different time.`;
  return null;
}

function SlotConfirm({
  slot,
  slots,
  busy,
  onClose,
  onConfirm,
}: {
  slot: Slot;
  slots: Slot[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const reopening = slot.state === "cancelled";
  const problem = reopening ? reopenProblem(slot, slots) : null;
  const when = `${slot.day} · ${slot.start}–${slot.end} IST`;
  return (
    <Modal onClose={onClose} labelledBy="slot-confirm-title">
      <h2 id="slot-confirm-title" className="m-0 text-[19px] font-bold text-ink">
        {reopening ? "Open this slot again?" : "Cancel this open slot?"}
      </h2>
      <p className="mt-1.5 text-[13.5px] font-semibold text-stone-600 tabular-nums">{when}</p>
      <p className="mt-2.5 text-[13.5px] leading-normal text-stone-600">
        {reopening
          ? "Customers will be able to book it again."
          : "Customers won't be able to book it any more. The cancelled slot stays on your calendar, and you can open it again later."}
      </p>
      {problem && (
        <div className="mt-3 flex items-start gap-[9px] rounded-xl border border-rose-200 bg-rose-50 px-[13px] py-[11px]">
          <span className="text-rose-700">✕</span>
          <span className="text-[12.5px] leading-[1.45] text-rose-900">{problem}</span>
        </div>
      )}
      <div className="mt-5 flex gap-2.5">
        <button type="button" onClick={onClose} className={`h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold ${M_SECONDARY}`}>
          {problem ? "Close" : reopening ? "Not now" : "Keep it open"}
        </button>
        {!problem && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-11 flex-1 rounded-xl text-sm font-bold ${reopening ? `bg-amber-500 text-ink ${M_PRIMARY}` : "bg-rose-700 text-white max-lg:rounded-app-btn max-lg:text-[15px]"} disabled:opacity-60`}
          >
            {reopening ? "Open this slot again" : "Cancel slot"}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** The slot covering `hour` on `day` (a live slot wins over a cancelled one kept for the audit trail). */
function slotAt(slots: Slot[], day: string, hour: string): Slot | undefined {
  return (
    slots.find((x) => x.day === day && x.state !== "cancelled" && x.start <= hour && hour < x.end) ??
    slots.find((x) => x.day === day && x.start <= hour && hour < x.end)
  );
}

/** Phones and tablets (< 1024px): the week as day chips and the chosen day's hours as rows. */
function MobileAgenda({
  days,
  today,
  hours,
  slots,
  onClick,
}: {
  days: string[];
  today: string;
  hours: string[];
  slots: Slot[];
  onClick: (day: string, hour: string) => void;
}) {
  const [picked, setPicked] = useState(days.includes(today) ? today : days[0]);
  const day = days.includes(picked) ? picked : days[0];
  const count = (d: string) => slots.filter((x) => x.day === d && x.state !== "cancelled").length;
  // Keep the chosen day's chip in view (today can be at the end of the week).
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current?.firstElementChild;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip || !row.clientWidth) return; // hidden on desktop
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }, [day]);
  return (
    <div className="mt-3.5 lg:hidden">
      <div ref={rowRef}>
      <ChipRow label="Day">
        {days.map((d) => {
          const n = count(d);
          return (
            <Chip key={d} on={d === day} onClick={() => setPicked(d)} count={n || undefined}>
              {d === today ? `Today · ${d}` : d}
              {n > 0 && <span className="sr-only">, {n} slot{n === 1 ? "" : "s"}</span>}
            </Chip>
          );
        })}
      </ChipRow>
      </div>
      <ul className="mt-3 flex flex-col gap-2" aria-label={`${day} hours`}>
        {hours.map((hour) => {
          const slot = slotAt(slots, day, hour);
          const c = CELL[slot ? slot.state : "unset"];
          const who = slot?.state === "booked" ? (slot.customerName ?? null) : null;
          const label = !slot
            ? "Add a slot"
            : slot.state === "booked"
              ? who
                ? `Booked · ${who}`
                : "Booked"
              : slot.state === "cancelled"
                ? "Cancelled — tap to open again"
                : `Open · ${slot.start}–${slot.end}`;
          return (
            <li key={hour}>
              <button
                type="button"
                onClick={() => onClick(day, hour)}
                aria-label={`${day} ${hour}: ${c.label || "no slot — add one"}${who ? ` · ${who}` : ""}`}
                className="flex min-h-app-hit w-full items-center gap-3 rounded-app-card border border-app-line bg-app-surface p-2 pl-3 text-left shadow-app-card active:bg-app-elev"
              >
                <b className="w-12 shrink-0 text-[13.333px] text-app-ink tabular-nums">{hour}</b>
                <span
                  className={`flex min-h-9 min-w-0 flex-1 items-center rounded-[10px] border px-3 text-[13px] font-semibold ${slot ? "" : "border-dashed text-app-ink-3"}`}
                  style={slot ? { background: c.bg, borderColor: c.border, color: c.fg } : { borderColor: "#e7e0d6" }}
                >
                  <span className="truncate">{label}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 pr-1 text-[12px] text-app-ink-3">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({
  hour,
  days,
  slots,
  onClick,
}: {
  hour: string;
  days: string[];
  slots: Slot[];
  onClick: (day: string, hour: string) => void;
}) {
  return (
    <>
      <div className="pt-1 pr-2 text-right text-[11px] text-stone-400 tabular-nums">{hour}</div>
      {days.map((d) => {
        // A live slot wins over a cancelled one kept for the audit trail.
        const slot =
          slots.find((x) => x.day === d && x.state !== "cancelled" && x.start <= hour && hour < x.end) ??
          slots.find((x) => x.day === d && x.start <= hour && hour < x.end);
        const c = CELL[slot ? slot.state : "unset"];
        // Booked cells show who booked them (first name; the full name is in the label).
        const who = slot?.state === "booked" ? slot.customerName ?? null : null;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onClick(d, hour)}
            aria-label={`${d} ${hour}: ${c.label || "no slot — add one"}${who ? ` · ${who}` : ""}`}
            className="h-[34px] truncate rounded-[7px] border px-1 text-[10.5px] font-bold"
            style={{ background: c.bg, borderColor: c.border, color: c.fg }}
          >
            {who ? who.split(" ")[0] : c.label}
          </button>
        );
      })}
    </>
  );
}
