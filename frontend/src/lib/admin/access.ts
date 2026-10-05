import type { AdminSession, NavGroup, PageKey } from "./types";

/** True when the signed-in admin's role may open this page (the API's PAGES table, via the session). */
export function canAccess(session: Pick<AdminSession, "pages">, page: PageKey): boolean {
  return session.pages.includes(page);
}

/**
 * Nav groups with the items this role may not open removed (absent, not greyed out),
 * and the open-work counts from the session put on the badges.
 */
export function navForSession(nav: NavGroup[], session: AdminSession): NavGroup[] {
  return nav
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => canAccess(session, i.key))
        .map((i) => ({ ...i, count: session.counts[i.key] || undefined })),
    }))
    .filter((g) => g.items.length > 0);
}
