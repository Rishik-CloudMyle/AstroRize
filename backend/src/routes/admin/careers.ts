import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { notFound } from "../../lib/errors.ts";
import { istDate, istTime } from "../../lib/format.ts";
import { adminOf, requirePage } from "../../lib/rbac.ts";

// Careers page of the admin console (HR): applications sent from the website's Careers form.
// HR reads the message, downloads the resume and marks where the application stands.
export const adminCareersRouter = Router();

const STATUSES = ["NEW", "REVIEWING", "FORWARDED", "SHORTLISTED", "REJECTED"] as const;

adminCareersRouter.get("/careers", async (req, res) => {
  requirePage(req, "hr");
  const rows = await db.jobApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, name: true, email: true, phone: true, area: true, subject: true, message: true, resumeName: true, status: true, createdAt: true },
  });
  res.json({
    applications: rows.map(({ createdAt, ...r }) => ({ ...r, receivedAt: `${istDate(createdAt)}, ${istTime(createdAt)}` })),
  });
});

adminCareersRouter.get("/careers/:id/resume", async (req, res) => {
  requirePage(req, "hr");
  const row = await db.jobApplication.findUnique({ where: { id: String(req.params.id) }, select: { resumeName: true, resumeType: true, resumeData: true } });
  if (!row) throw notFound("That application doesn't exist.");
  res.setHeader("Content-Type", row.resumeType);
  res.setHeader("Content-Disposition", `attachment; filename="${row.resumeName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(row.resumeData));
});

adminCareersRouter.patch("/careers/:id", async (req, res) => {
  requirePage(req, "hr");
  const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
  const id = String(req.params.id);
  const row = await db.jobApplication.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!row) throw notFound("That application doesn't exist.");
  await db.jobApplication.update({ where: { id }, data: { status } });
  await audit(adminOf(req), "career.status", id, `${row.name} → ${status}`);
  res.json({ ok: true });
});
