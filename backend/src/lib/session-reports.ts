import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "./audit.ts";
import { makeRef } from "./format.ts";
import { configNumber } from "./settings.ts";

/** What a customer or astrologer can report about a consultation. */
export const REPORT_REASONS = {
  customer: ["Rude or abusive behaviour", "Asked for contact details or payment outside Astrorize", "Wrong or misleading advice", "Poor call or chat quality", "Other"],
  astrologer: ["Abusive or inappropriate behaviour", "Asked for contact details or personal information", "Spam or time-wasting", "Other"],
} as const;

export const reportBody = z.object({
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(2000).optional(),
});

/** Raises a support ticket for the session so Support sees it; returns its reference. */
export async function fileSessionReport(opts: {
  by: "customer" | "astrologer";
  reporterName: string;
  customerId: string | null;
  consultation: { ref: string; customerAlias: string };
  reason: string;
  details?: string;
}): Promise<string> {
  let id = makeRef("RPT", 4);
  while (await db.supportTicket.findUnique({ where: { id } })) id = makeRef("RPT", 4);
  const slaMins = await configNumber("support.sla.first_response_mins", 30);
  await db.supportTicket.create({
    data: {
      id,
      subject: `Session report: ${opts.reason} (by ${opts.by === "customer" ? "customer" : "astrologer"} ${opts.reporterName})`,
      description: opts.details || null,
      category: opts.by === "customer" ? "CONSULTATION" : "ASTROLOGER_REPORT",
      state: "INVESTIGATING",
      slaDueAt: new Date(Date.now() + Math.max(5, slaMins) * 60_000),
      customerAlias: opts.consultation.customerAlias,
      sessionRef: opts.consultation.ref,
      customerId: opts.by === "customer" ? opts.customerId : null,
      customerReadAt: opts.by === "customer" ? new Date() : null,
    },
  });
  await audit(null, "session.report", id, `${opts.by} ${opts.reporterName} reported ${opts.consultation.ref}: ${opts.reason}`);
  return id;
}

export async function isBlocked(astrologerId: string, customerId: string) {
  return !!(await db.customerBlock.findUnique({ where: { astrologerId_customerId: { astrologerId, customerId } }, select: { id: true } }));
}
