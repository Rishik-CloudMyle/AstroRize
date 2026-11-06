import { Router } from "express";
import { db } from "../db.ts";
import { notFound, unauthorized } from "../lib/errors.ts";
import { PRIVATE_DIR, UPLOAD_DIR, mediaContentType } from "../lib/media.ts";
import { customerTicketWhere, staffCanView } from "../lib/tickets.ts";

// Serves uploaded images (GET /api/media/<file>). Names are random and never reused,
// so browsers may cache them for good. Only names we generate are accepted, which
// rules out path tricks like "../.env".
export const mediaRouter = Router();

mediaRouter.get("/:file", (req, res, next) => {
  const name = String(req.params.file);
  const type = mediaContentType(name);
  if (!type) throw notFound("No such file.");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.sendFile(name, { root: UPLOAD_DIR, dotfiles: "deny", headers: { "Content-Type": type } }, (err) => {
    // Done, or the viewer stopped loading (a video player moving to another range): nothing to answer.
    if (!err || res.headersSent || (err as { code?: string }).code === "ECONNABORTED") return;
    if ((err as { code?: string }).code === "ENOENT" || (err as { status?: number }).status === 404) {
      res.setHeader("Cache-Control", "no-store");
      return next(notFound("No such file."));
    }
    next(err);
  });
});

/**
 * A screenshot a customer attached to a support issue (GET /api/media/tickets/<messageId>/<file>).
 * Private: only that customer and staff who can see the ticket (lib/tickets.ts) may open it; anyone
 * else gets the same 404 as for a file that doesn't exist.
 */
mediaRouter.get("/tickets/:messageId/:file", async (req, res, next) => {
  const name = String(req.params.file);
  const type = mediaContentType(name);
  if (!type || !type.startsWith("image/")) throw notFound("No such file.");
  const auth = req.auth;
  if (!auth) throw unauthorized();
  const message = await db.supportTicketMessage.findUnique({
    where: { id: String(req.params.messageId) },
    select: { attachment: true, ticket: { select: { id: true, assignedTeam: true, refundState: true, state: true } } },
  });
  let allowed = !!message && message.attachment === name;
  if (allowed && message) {
    allowed =
      auth.role === "customer"
        ? !!(await db.supportTicket.findFirst({ where: { AND: [{ id: message.ticket.id }, await customerTicketWhere(auth.user.id)] }, select: { id: true } }))
        : await staffCanView(auth, message.ticket);
  }
  if (!allowed) throw notFound("No such file.");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.sendFile(name, { root: PRIVATE_DIR, dotfiles: "deny", headers: { "Content-Type": type } }, (err) => {
    // Done, or the viewer stopped loading (a video player moving to another range): nothing to answer.
    if (!err || res.headersSent || (err as { code?: string }).code === "ECONNABORTED") return;
    if ((err as { code?: string }).code === "ENOENT" || (err as { status?: number }).status === 404) {
      res.setHeader("Cache-Control", "no-store");
      return next(notFound("No such file."));
    }
    next(err);
  });
});

/**
 * A photo or video sent in a customer–astrologer conversation (GET /api/media/messages/<id>/<file>).
 * Private: only that conversation's customer and astrologer may open it; anyone else gets the
 * same 404 as for a file that doesn't exist. Supports Range requests, so videos can seek.
 */
mediaRouter.get("/messages/:messageId/:file", async (req, res, next) => {
  const name = String(req.params.file);
  const type = mediaContentType(name);
  if (!type) throw notFound("No such file.");
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  const message = await db.message.findUnique({
    where: { id: String(req.params.messageId) },
    select: {
      attachment: true,
      attachmentState: true,
      attachmentPoster: true,
      blocked: true,
      thread: { select: { customerId: true, astrologer: { select: { userId: true } } } },
    },
  });
  // The file itself once it is ready (a video being compressed isn't served yet), or a video's poster.
  const allowed =
    !!message &&
    !message.blocked &&
    ((message.attachment === name && !message.attachmentState) || (!!message.attachmentPoster && message.attachmentPoster === name)) &&
    (message.thread.customerId === user.id || (!!message.thread.astrologer.userId && message.thread.astrologer.userId === user.id));
  if (!allowed) throw notFound("No such file.");
  // Never kept by shared caches; the viewer's own browser may keep it while they scroll.
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.sendFile(name, { root: PRIVATE_DIR, dotfiles: "deny", acceptRanges: true, headers: { "Content-Type": type } }, (err) => {
    // Done, or the viewer stopped loading (a video player moving to another range): nothing to answer.
    if (!err || res.headersSent || (err as { code?: string }).code === "ECONNABORTED") return;
    if ((err as { code?: string }).code === "ENOENT" || (err as { status?: number }).status === 404) {
      res.setHeader("Cache-Control", "no-store");
      return next(notFound("No such file."));
    }
    next(err);
  });
});
