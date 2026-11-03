/** An error answer from the Node API, with the message it is safe to show the person. */
export class ApiError extends Error {
  status: number;
  code: string;
  /** Any other fields of the error answer, e.g. the new rate on a "rate_changed" refusal. */
  details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function readResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error;
    // The account is blocked (repeated contact sharing): the session store re-reads it and the banner shows.
    if (error?.code === "account_blocked" && typeof window !== "undefined") window.dispatchEvent(new Event("astrorize:account-blocked"));
    throw new ApiError(res.status, error?.code ?? "error", error?.message ?? "Something went wrong. Please try again.", error ?? {});
  }
  return body as T;
}
