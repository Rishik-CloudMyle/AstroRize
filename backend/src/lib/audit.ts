import { db } from "../db.ts";
import type { AuthContext } from "../middleware/auth.ts";
import { shortId } from "./format.ts";

/** Records a privileged action. Called inside the same request, before the response. */
export async function audit(
  auth: AuthContext | null,
  action: string,
  object: string,
  diff: string,
  options: { breakGlass?: boolean } = {},
) {
  await db.auditLog.create({
    data: {
      actorId: auth?.user.id,
      actorName: auth?.user.actorName ?? auth?.user.name ?? "System",
      action,
      object,
      diff,
      correlation: shortId(),
      breakGlass: options.breakGlass ?? false,
    },
  });
}
