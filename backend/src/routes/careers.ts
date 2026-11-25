import express, { Router } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { badRequest } from "../lib/errors.ts";
import { notifyMany } from "../lib/notifications.ts";
import { rateLimit } from "../lib/safety.ts";

// The website's Careers form (any role: technical, astrologer, anything else). The applicant sends a
// subject, a message and a resume (PDF or Word, 1 MB at most). It is saved for HR, who read it on the
// Careers page of the admin console (routes/admin/careers.ts) and can forward the resume.
export const careersRouter = Router();

export const RESUME_MAX_BYTES = 1024 * 1024;
export const AREAS = ["Astrologer", "Technical", "Marketing", "Support", "Finance", "Other"] as const;

const body = z.object({
  name: z.string({ error: "Enter your name." }).trim().min(2, "Enter your name.").max(80, "Keep the name under 80 characters."),
  email: z.string({ error: "Enter your email." }).trim().toLowerCase().email("Enter a valid email address.").max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || null),
  area: z.enum(AREAS, { error: "Choose the kind of role." }),
  subject: z.string({ error: "Enter a subject." }).trim().min(3, "Enter a subject.").max(120, "Keep the subject under 120 characters."),
  message: z.string({ error: "Write a short message." }).trim().min(10, "Write a short message (at least 10 characters).").max(3000, "Keep the message under 3000 characters."),
  resumeName: z.string({ error: "Attach your resume." }).trim().min(1, "Attach your resume.").max(160),
  /** The resume file, base64. */
  resume: z.string({ error: "Attach your resume." }).min(1, "Attach your resume."),
});

/** What the file really is, by its first bytes (never the name the browser sent). */
function resumeKind(buf: Buffer): { ext: string; type: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  if (buf[0] === 0x50 && buf[1] === 0x4b) return { ext: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return { ext: "doc", type: "application/msword" };
  return null;
}

careersRouter.post("/", express.json({ limit: "2mb" }), async (req, res) => {
  rateLimit(`careers:${req.ip}`, 5, 60 * 60 * 1000, "Too many applications from this connection. Please try again later.");
  const input = body.parse(req.body);
  const buf = Buffer.from(input.resume, "base64");
  if (buf.length === 0) throw badRequest("Attach your resume.");
  if (buf.length > RESUME_MAX_BYTES) throw badRequest("The resume is larger than 1 MB. Please attach a smaller file.");
  const kind = resumeKind(buf);
  if (!kind) throw badRequest("The resume must be a PDF or Word file (.pdf, .doc or .docx).");

  const safeName = input.resumeName.replace(/\.[^.]*$/, "").replace(/[^\w\- ]+/g, "_").slice(0, 80) || "resume";
  const row = await db.jobApplication.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      area: input.area,
      subject: input.subject,
      message: input.message,
      resumeName: `${safeName}.${kind.ext}`,
      resumeType: kind.type,
      resumeData: new Uint8Array(buf),
    },
    select: { id: true },
  });

  // Tell HR (and Super Admins) there is a new application. Never fails the submission.
  try {
    const people = await db.user.findMany({ where: { role: "ADMIN", active: true, adminRole: { in: ["HR", "SUPER"] } }, select: { id: true } });
    await notifyMany(
      people.map((p) => p.id),
      { kind: "staff.career.new", title: `New application · ${input.area}`, body: `${input.name}: ${input.subject}`, href: "/admin/careers" },
    );
  } catch (e) {
    console.error("Couldn't notify HR about an application:", e instanceof Error ? e.message : e);
  }
  res.status(201).json({ ok: true, id: row.id });
});
