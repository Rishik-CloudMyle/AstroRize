import { Router } from "express";
import { assertNotBlocked } from "../lib/account-blocks.ts";
import { z } from "zod";
import { db } from "../db.ts";
import { forbidden, notFound } from "../lib/errors.ts";
import { consultationFor } from "../lib/consult-room.ts";
import { flagContactAttempt, type FlagPlace } from "../lib/contact-flags.ts";
import { findContactDetails, rateLimit } from "../lib/safety.ts";
import { requireUser } from "../middleware/auth.ts";

// The website checks a message with the contact filter before sending it, so the person sees at
// once what is wrong and nothing is sent. Such an attempt never reaches the send routes, so the
// page reports it here and it is flagged for Trust & reviews like one the API stopped itself.
// The text is checked again here (the API's own rules decide) and only a masked snippet is kept.
export const contactAttemptsRouter = Router();

const body = z.object({
  where: z.enum(["messages", "consultation", "live"]),
  /** Messages: the astrologer's slug (customer) or the conversation id (astrologer); a consultation id; a live room id. */
  ref: z.string().trim().min(1).max(80),
  text: z.string().max(2000),
});

contactAttemptsRouter.post("/contact-attempts", async (req, res) => {
  const auth = requireUser(req);
  if (auth.role !== "customer" && auth.role !== "astrologer") throw forbidden();
  // A blocked account can't send at all, so its attempts aren't counted again.
  assertNotBlocked(auth);
  const { where, ref, text } = body.parse(req.body);
  rateLimit(`contact-attempt:${auth.user.id}`, 20, 60_000, "Too many attempts. Wait a minute.");
  const kinds = findContactDetails(text, where === "consultation" ? "PAID" : "FREE");
  if (!kinds.length) return res.json({ flagged: false });

  const side = auth.role === "astrologer" ? "ASTROLOGER" : "CUSTOMER";
  let flagRef: string;
  const place: FlagPlace = where;
  if (where === "messages") {
    if (side === "CUSTOMER") {
      const astrologer = await db.astrologer.findUnique({ where: { slug: ref }, select: { id: true } });
      if (!astrologer) throw notFound("Astrologer not found.");
      flagRef = `${astrologer.id}:${auth.user.id}`;
    } else {
      const thread = await db.messageThread.findUnique({ where: { id: ref }, select: { astrologerId: true, customerId: true } });
      if (!thread || thread.astrologerId !== auth.astrologerId || !thread.customerId) throw notFound("Conversation not found.");
      flagRef = `${thread.astrologerId}:${thread.customerId}`;
    }
  } else if (where === "consultation") {
    const partyId = side === "CUSTOMER" ? auth.user.id : auth.astrologerId;
    if (!partyId) throw forbidden();
    flagRef = (await consultationFor(ref, side, partyId)).id;
  } else {
    const room = await db.liveRoom.findUnique({ where: { id: ref }, select: { id: true } });
    if (!room) throw notFound("Live room not found.");
    flagRef = room.id;
  }
  await flagContactAttempt({ userId: auth.user.id, name: auth.user.name, side, place, ref: flagRef, kinds, text });
  res.json({ flagged: true });
});
