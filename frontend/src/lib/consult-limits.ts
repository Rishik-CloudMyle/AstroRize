// Limits the admin sets (Config consult.*) that the screens need to show and check.
// Read once when the app opens; the defaults hold until then.

let minBalanceMinutes = 1;

if (typeof window !== "undefined") {
  fetch("/api/consult-limits")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { minBalanceMinutes?: number } | null) => {
      if (j?.minBalanceMinutes && j.minBalanceMinutes > 0) minBalanceMinutes = j.minBalanceMinutes;
    })
    .catch(() => {});
}

/** Minutes of balance (at the call's rate) a customer needs before a paid call can start. */
export const minBalanceMins = () => minBalanceMinutes;
