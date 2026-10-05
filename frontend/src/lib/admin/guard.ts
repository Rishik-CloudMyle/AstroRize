import { canAccess } from "./access";
import { getSession } from "./api";
import type { PageKey } from "./types";

/** True when the signed-in admin's role includes this page. Pages render <AccessDenied/> otherwise. */
export async function allowed(page: PageKey): Promise<boolean> {
  return canAccess(await getSession(), page);
}
