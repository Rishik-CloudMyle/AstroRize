"use client";

import { useAction } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { RbacData } from "@/lib/admin/types";

const CODE = "rounded-[5px] bg-white px-1.5 py-0.5 font-mono";

/** Separation-of-duties warning with the two ways out (prototype rbacAct). */
export default function SodConflict({ conflict }: { conflict: NonNullable<RbacData["conflict"]> }) {
  const { run } = useAction();
  const { user, requested, existing, alternative } = conflict;
  const grant = conflict.resolved === "grant-alternative" ? "review" : conflict.resolved === "revoke" ? "revoked" : null;

  // The API records the decision (and refuses a second one once the case is resolved).
  const grantReview = () =>
    void run(
      () => api.post("/admin/rbac/conflict/grant-alternative"),
      `Granted ${alternative} to ${user} — no separation-of-duties conflict.`,
    );
  const revoke = () =>
    void run(
      () => api.post("/admin/rbac/conflict/revoke"),
      `Revoked ${existing} from ${user}. ${requested} may now be granted.`,
    );

  return (
    <div className="relative mt-4 rounded-[18px] border-2 border-rose-700 bg-rose-50 p-5">
      <b className="text-[15px] text-rose-700">Separation-of-duties conflict</b>
      <p className="mt-[7px] mb-0 max-w-[78ch] text-[13.5px] leading-[1.6] text-rose-900">
        Granting <code className={CODE}>{requested}</code> to {user} conflicts with her existing{" "}
        <code className={CODE}>{existing}</code>. A suspend-maker may not also restore. Grant{" "}
        <code className={CODE}>{alternative}</code> instead, or revoke the suspend capability first.
      </p>
      {grant && (
        <div className="mt-3.5 inline-flex h-10 items-center rounded-[11px] border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-bold text-emerald-700">
          {grant === "review"
            ? `✓ ${alternative} granted — no conflict`
            : `✓ ${existing} revoked — restore may now be granted`}
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={grantReview}
          className="h-[42px] rounded-[11px] border border-rose-700 bg-white px-[17px] text-[13px] font-bold text-rose-700"
        >
          Grant the review capability instead
        </button>
        <button
          type="button"
          onClick={revoke}
          className="h-[42px] rounded-[11px] border border-rose-200 bg-white px-[17px] text-[13px] font-bold text-rose-900"
        >
          Revoke suspend first
        </button>
      </div>
    </div>
  );
}
