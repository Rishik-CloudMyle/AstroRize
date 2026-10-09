"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { EYEBROW, PANEL } from "@/components/admin/ui";
import PasswordInput from "@/components/ui/password-input";
import { api, ApiError } from "@/lib/api/client";
import { STAFF_SORTS, sortRows } from "@/lib/admin/sort";
import type { Role, StaffDepartment, StaffMember } from "@/lib/admin/types";

// Team: department → people tree, with switch off/on, password reset and "add a person".
// The API (Super Admin only) enforces every rule; this view shows its messages as is.

const FIELD = "h-10 w-full rounded-[10px] border bg-white px-3 text-[13px] text-ink";
const GHOST = "h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-[#57534e]";

/** Same rule as the API: at least 10 characters with a letter and a number. */
function passwordProblem(p: string): string | null {
  if (p.length < 10) return "The temporary password needs at least 10 characters.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "The temporary password needs at least one letter and one number.";
  return null;
}

/** A random 12-character temporary password with letters and digits (no look-alike characters). */
function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(bytes, (b) => all[b % all.length]);
  chars[bytes[0] % 6] = letters[bytes[1] % letters.length];
  chars[6 + (bytes[2] % 6)] = digits[bytes[3] % digits.length];
  return chars.join("");
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 mb-0 text-[12px] font-semibold text-rose-700">
      {message}
    </p>
  );
}

function PersonRow({ person, last }: { person: StaffMember; last: boolean }) {
  const { say } = useAdmin();
  const { run, busy } = useAction();
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = () => {
    if (person.active) {
      const ok = window.confirm(
        `Switch off ${person.name}? They are signed out everywhere straight away and can't sign in until switched back on.`,
      );
      if (!ok) return;
    }
    void run(
      () => api.patch<{ revoked: number }>(`/admin/staff/${person.id}`, { active: !person.active }),
      (r) =>
        person.active
          ? `${person.name} switched off · ${r.revoked} signed-in session${r.revoked === 1 ? "" : "s"} ended. Audited.`
          : `${person.name} switched back on. They can sign in again. Audited.`,
    );
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = passwordProblem(password);
    setProblem(local);
    if (local || saving) return;
    setSaving(true);
    try {
      const r = await api.post<{ revoked: number }>(`/admin/staff/${person.id}/password`, { password });
      setResetOpen(false);
      setPassword("");
      say(
        `Password reset for ${person.name} · ${r.revoked} session${r.revoked === 1 ? "" : "s"} ended. Share the new password with them privately.`,
      );
      router.refresh();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't reset the password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="relative pl-7">
      {/* Tree connector: ├── for every person, └── for the last one. The trunk reaches up
          over the 8px gap so it runs unbroken from the department heading to the last person. */}
      <span
        aria-hidden
        className="absolute top-[-8px] left-[9px] w-px bg-[#d6cbb8]"
        style={{ height: last ? "35px" : "calc(100% + 8px)" }}
      />
      <span aria-hidden className="absolute top-[26px] left-[9px] h-px w-[14px] bg-[#d6cbb8]" />

      <div
        className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
        style={{ borderColor: "#e7e0d6", background: person.active ? "#fff" : "#f7f4ee" }}
      >
        <span
          className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-full text-[12px] font-extrabold"
          style={{ background: person.active ? "#fef3c7" : "#e7e5e4", color: person.active ? "#92400e" : "#78716c" }}
        >
          {person.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className={`truncate text-[13.5px] ${person.active ? "text-ink" : "text-[#78716c]"}`}>{person.name}</b>
            {person.isYou && (
              <span className="inline-flex h-[19px] items-center rounded-full bg-ink px-[7px] text-[10px] font-extrabold text-amber-300">
                You
              </span>
            )}
            <span
              className="inline-flex h-[20px] items-center rounded-full px-2 text-[10.5px] font-extrabold"
              style={
                person.active
                  ? { background: "#ecfdf5", color: "#047857" }
                  : { background: "#f5f5f4", color: "#78716c" }
              }
            >
              {person.active ? "Active" : "Switched off"}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[#57534e]">
            {person.email ?? "—"} <span className="text-[#a8a29e]">·</span> audit name {person.actorName}
          </div>
          <div className="text-[11px] text-[#78716c]">
            {person.lastLogin ? `Last sign-in ${person.lastLogin} IST` : "Never signed in"} · added {person.added}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            className={GHOST}
            aria-expanded={resetOpen}
            onClick={() => {
              setResetOpen((o) => !o);
              setProblem(null);
              setPassword("");
            }}
          >
            Reset password
          </button>
          {!person.isYou && (
            <button
              type="button"
              disabled={busy}
              onClick={toggle}
              className="h-[30px] rounded-[9px] border px-3 text-[12px] font-bold disabled:opacity-50"
              style={
                person.active
                  ? { background: "#fff", borderColor: "#fecdd3", color: "#be123c" }
                  : { background: "#047857", borderColor: "#047857", color: "#fff" }
              }
            >
              {person.active ? "Switch off" : "Switch on"}
            </button>
          )}
        </div>
      </div>

      {resetOpen && (
        <form onSubmit={reset} noValidate className="mt-2 mb-1 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <label className="block">
            <span className="text-[11.5px] font-bold text-amber-900">New temporary password for {person.name}</span>
            <div className="mt-1.5 flex gap-2">
              <PasswordInput
                defaultVisible
                wrapperClassName="min-w-0 flex-1"
                value={password}
                autoComplete="new-password"
                spellCheck={false}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (problem) setProblem(null);
                }}
                aria-invalid={problem ? true : undefined}
                className={`${FIELD} font-mono`}
                style={{ borderColor: problem ? "#be123c" : "#e7e0d6" }}
              />
              <button type="button" className={`${GHOST} h-10`} onClick={() => setPassword(generatePassword())}>
                Generate
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-[10px] border-0 bg-amber-500 px-4 text-[12.5px] font-bold whitespace-nowrap text-ink disabled:opacity-50"
              >
                {saving ? "Saving…" : "Set password"}
              </button>
            </div>
          </label>
          <ErrorLine message={problem} />
          <p className="mt-2 mb-0 text-[11.5px] text-amber-900">
            {person.isYou
              ? "Your other signed-in browsers are signed out; this one stays signed in."
              : `${person.name} is signed out everywhere and must use the new password.`}
          </p>
        </form>
      )}
    </li>
  );
}

function AddPerson({ departments }: { departments: StaffDepartment[] }) {
  const { say } = useAdmin();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState<Role | "">("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = !name.trim()
      ? "Enter the person's full name."
      : !/^\S+@\S+\.\S+$/.test(email.trim())
        ? "Enter a valid email address."
        : !department
          ? "Choose a department."
          : passwordProblem(password);
    setProblem(local);
    if (local || saving) return;
    setSaving(true);
    try {
      await api.post("/admin/staff", { name: name.trim(), email: email.trim(), department, password });
      const label = departments.find((d) => d.role === department)?.label ?? department;
      say(`${name.trim()} added to ${label}. Share the temporary password with them privately. Audited.`);
      setName("");
      setEmail("");
      setDepartment("");
      setPassword("");
      router.refresh();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't add this person. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const clearProblem = () => problem && setProblem(null);

  return (
    <form onSubmit={submit} noValidate className={`${PANEL} sticky top-[22px] p-5`}>
      <h2 className="mt-0 mb-1 text-[16px] font-bold">Add a person</h2>
      <p className="mt-0 mb-4 text-[12px] leading-[1.5] text-[#78716c]">
        They sign in with this email and the temporary password you set. It is never shown again after you save.
      </p>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Full name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearProblem();
            }}
            autoComplete="off"
            maxLength={60}
            className={`${FIELD} border-line`}
          />
        </label>
        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearProblem();
            }}
            autoComplete="off"
            placeholder="name@astrorize.com"
            className={`${FIELD} border-line`}
          />
        </label>
        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Department</span>
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value as Role | "");
              clearProblem();
            }}
            className={`${FIELD} border-line`}
          >
            <option value="">Choose a department</option>
            {departments.map((d) => (
              <option key={d.role} value={d.role}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Temporary password</span>
          <div className="flex gap-2">
            <PasswordInput
              defaultVisible
              wrapperClassName="min-w-0 flex-1"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearProblem();
              }}
              autoComplete="new-password"
              spellCheck={false}
              className={`${FIELD} border-line font-mono`}
            />
            <button type="button" className={`${GHOST} h-10`} onClick={() => setPassword(generatePassword())}>
              Generate
            </button>
          </div>
          <span className="mt-1 block text-[11px] text-[#78716c]">
            At least 10 characters, with a letter and a number.
          </span>
        </label>
      </div>
      <ErrorLine message={problem} />
      <button
        type="submit"
        disabled={saving}
        className="mt-4 h-11 w-full rounded-xl border-0 bg-[linear-gradient(90deg,#ffd233,#ff8c1a)] text-[13.5px] font-bold text-cta-ink disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add to team"}
      </button>
    </form>
  );
}

export default function TeamView({ departments }: { departments: StaffDepartment[] }) {
  const [sort, setSort] = useUrlSort(STAFF_SORTS);
  return (
    <div className="mt-5 grid grid-cols-[minmax(0,1fr)_340px] items-start gap-[18px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="pb-3 text-[12px] font-semibold text-[#78716c]">
            People are sorted within each department.
          </span>
          <SortSelect options={STAFF_SORTS} value={sort} onChange={setSort} className="w-[250px]" />
        </div>
        {departments.map((d) => {
          const people = sortRows(d.people, STAFF_SORTS, sort);
          const active = people.filter((p) => p.active).length;
          return (
            <section key={d.role} className={`${PANEL} p-5`} aria-labelledby={`dept-${d.role}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`dept-${d.role}`} className="m-0 text-[16px] font-bold">
                  {d.label}
                </h2>
                <span className="text-[12px] font-semibold text-[#78716c]">
                  {people.length} {people.length === 1 ? "person" : "people"} · {active} active
                </span>
              </div>
              {people.length ? (
                <ul className="mt-3 mb-0 flex list-none flex-col gap-2 p-0">
                  {people.map((p, i) => (
                    <PersonRow key={p.id} person={p} last={i === people.length - 1} />
                  ))}
                </ul>
              ) : (
                <p className="mt-3 mb-0 text-[12.5px] text-[#78716c]">
                  Nobody in this department yet. Add someone with the form on the right.
                </p>
              )}
              {people.length > 0 && active === 0 && (
                <p className="mt-3 mb-0 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
                  Everyone here is switched off — nobody can do this department&apos;s work right now.
                </p>
              )}
            </section>
          );
        })}
      </div>
      <AddPerson departments={departments} />
    </div>
  );
}
