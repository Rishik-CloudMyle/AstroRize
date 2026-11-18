"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { Gift } from "@/lib/admin/types";

const INPUT = "h-10 rounded-[10px] border border-line bg-white px-3 text-[13.5px]";
const BTN = "h-8 rounded-full border border-line bg-white px-3 text-[12px] font-bold text-ink hover:bg-cream disabled:opacity-50";
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

/** The gift catalogue: add, edit, price, and show or hide gifts. Marketing drafts; an Admin makes a gift live. */
export default function GiftEditor({ gifts, giftCap }: { gifts: Gift[]; giftCap: string }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const canApprove = session.capabilities.includes("campaign.approve");
  const canSubmit = session.capabilities.includes("campaign.submit");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [price, setPrice] = useState("");

  const open = (g: Gift | null) => {
    setEditing(g ? g.id : "new");
    setName(g?.name ?? "");
    setIcon(g?.icon ?? "");
    setPrice(g ? String(digits(g.price)) : "");
  };
  const save = async () => {
    const body = { name, icon, price: Number(price) };
    const res = await run(
      () => (editing === "new" ? api.post("/admin/gifts", body) : api.patch(`/admin/gifts/${editing}`, body)),
      editing === "new" ? `${name} added as a draft. An Admin makes it live.` : `${name} saved. Audited.`,
    );
    if (res !== undefined) setEditing(null);
  };
  const toggle = (g: Gift, action: "activate" | "hide") =>
    void run(() => api.patch(`/admin/gifts/${g.id}`, { action }), action === "activate" ? `${g.name} is live for customers.` : `${g.name} is hidden from customers.`);

  return (
    <div className="flex flex-col gap-[7px]">
      {gifts.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-[11px] rounded-xl border px-3 py-2.5" style={{ background: g.bg, borderColor: g.border }}>
          <span className="grid h-8 w-8 flex-[0_0_32px] place-items-center rounded-[10px] bg-amber-50 text-[14px] text-amber-800">{g.icon}</span>
          <b className="min-w-0 flex-1 text-[13.5px] text-ink">{g.name}</b>
          <span className="text-[13px] font-bold text-ink tabular-nums">{g.price}</span>
          <span className="inline-flex h-[21px] items-center rounded-full px-2 text-[9.5px] font-extrabold" style={{ background: g.tagBg, color: g.tagFg }}>
            {g.state}
          </span>
          {(canSubmit || canApprove) && (
            <span className="flex gap-1.5">
              {(g.state === "DRAFT" || canApprove) && (
                <button type="button" className={BTN} disabled={busy} onClick={() => open(g)}>
                  Edit
                </button>
              )}
              {canApprove && (g.state === "ACTIVE" || g.state === "AT CAP" ? (
                <button type="button" className={BTN} disabled={busy} onClick={() => toggle(g, "hide")}>
                  Hide
                </button>
              ) : (
                <button type="button" className={BTN} disabled={busy} onClick={() => toggle(g, "activate")}>
                  Make live
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
      {gifts.length === 0 && <p className="m-0 text-[13px] text-[#78716c]">No gifts yet.</p>}
      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-cream p-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[#78716c]">
            Icon
            <input className={`${INPUT} w-[70px]`} value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} />
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] font-bold text-[#78716c]">
            Name
            <input className={INPUT} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[#78716c]">
            Price (₹, up to {giftCap})
            <input className={`${INPUT} w-[130px]`} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="button" className={`${BTN} h-10 bg-amber-400 border-amber-400`} disabled={busy || !name || !icon || !price} onClick={() => void save()}>
            Save
          </button>
          <button type="button" className={`${BTN} h-10`} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      ) : (
        canSubmit && (
          <button type="button" className={`${BTN} mt-1 h-10 w-fit px-4`} onClick={() => open(null)}>
            + Add a gift
          </button>
        )
      )}
    </div>
  );
}
