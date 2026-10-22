import { Router, type Request } from "express";
import { db } from "../db.ts";
import { forbidden, notFound } from "../lib/errors.ts";
import { requireUser } from "../middleware/auth.ts";

// The bell: a signed-in customer's or astrologer's own in-app notifications (written by
// lib/notifications.ts `notify`). Nobody can read or mark anyone else's.
export const notificationsRouter = Router();

/** How many of the latest notifications the bell lists. */
const LIST_LIMIT = 30;

function owner(req: Request) {
  const auth = requireUser(req);
  if (auth.role !== "customer" && auth.role !== "astrologer") throw forbidden("Notifications are for customers and astrologers.");
  return auth.user.id;
}

notificationsRouter.get("/", async (req, res) => {
  const userId = owner(req);
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({
    unread,
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    })),
  });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const userId = owner(req);
  const { count } = await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true, marked: count });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const userId = owner(req);
  // Scoped to the owner: someone else's id answers "not found", exactly like a missing one.
  const { count } = await db.notification.updateMany({ where: { id: String(req.params.id), userId, readAt: null }, data: { readAt: new Date() } });
  if (!count && !(await db.notification.findFirst({ where: { id: String(req.params.id), userId }, select: { id: true } }))) {
    throw notFound("Notification not found.");
  }
  res.json({ ok: true });
});
