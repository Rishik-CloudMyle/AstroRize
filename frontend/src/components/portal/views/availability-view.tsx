"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { Availability, Slot, SlotState } from "@/lib/portal/types";
import Modal from "../modal";
import { useErrorToast, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";
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

const fieldClass = "h-12 w-full rounded-xl border bg-white text-[15px] text-ink outline-none";

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
          className="az-cta h-11 rounded-full px-5 text-sm font-bold"
        >
          ＋ Add slot
        </button>
      </PageHeader>

      <Panel className="mt-5 overflow-x-auto p-5">
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

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-[7px] text-[12.5px] font-semibold text-stone-600">
            <span className="size-3.5 rounded-[4px] border" style={{ background: l.bg, borderColor: l.border }} />
            {l.label}
          </span>
        ))}
      </div>

      {formOpen && (
        <div ref={formRef} className="scroll-mb-4">
          <Panel warm className="mt-[18px] max-w-[520px] p-[22px]">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[17px] font-bold">New slot</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close"
                className="size-[30px] rounded-[9px] bg-cream text-[15px] text-stone-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <div>
                <label htmlFor="slot-day" className="mb-1.5 block text-xs font-semibold text-stone-600">
                  Day
                </label>
                <select id="slot-day" value={day} onChange={(e) => setDay(e.target.value)} className={`${fieldClass} border-line px-3`}>
                  {data.days.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slot-start" className="mb-1.5 block text-xs font-semibold text-stone-600">
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
                <label htmlFor="slot-end" className="mb-1.5 block text-xs font-semibold text-stone-600">
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
                className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="h-11 flex-1 rounded-xl text-sm font-bold"
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
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold">
          {problem ? "Close" : reopening ? "Not now" : "Keep it open"}
        </button>
        {!problem && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-11 flex-1 rounded-xl text-sm font-bold ${reopening ? "bg-amber-500 text-ink" : "bg-rose-700 text-white"} disabled:opacity-60`}
          >
            {reopening ? "Open this slot again" : "Cancel slot"}
          </button>
        )}
      </div>
    </Modal>
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
