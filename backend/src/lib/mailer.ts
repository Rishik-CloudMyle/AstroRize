import nodemailer, { type Transporter } from "nodemailer";

// Email for the Careers form (client brief, Nov 2026):
//  - sent FROM careers@astrorize.com;
//  - the application details and the same resume go to BOTH careers@astrorize.com and hr@astrorize.com;
//  - the candidate gets an automatic acknowledgement, with Reply-To no-reply@astrorize.com.
// Needs SMTP_HOST, SMTP_USER and SMTP_PASS (see .env.example). Without them nothing is sent: the
// application is still saved for HR in the admin console, and the server log says email is off.

const env = (k: string, fallback = "") => (process.env[k] ?? fallback).trim();

export const mailConfig = {
  host: env("SMTP_HOST"),
  port: Number(env("SMTP_PORT", "587")),
  /** true for port 465 (implicit TLS); false for 587 (STARTTLS). */
  secure: env("SMTP_SECURE", env("SMTP_PORT", "587") === "465" ? "true" : "false") === "true",
  user: env("SMTP_USER"),
  pass: env("SMTP_PASS"),
  from: env("CAREERS_FROM", "careers@astrorize.com"),
  to: env("CAREERS_TO", "careers@astrorize.com,hr@astrorize.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ackReplyTo: env("CAREERS_ACK_REPLY_TO", "no-reply@astrorize.com"),
};

export const mailConfigured = () => !!(mailConfig.host && mailConfig.user && mailConfig.pass);

let transport: Transporter | null = null;
function transporter(): Transporter {
  transport ??= nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: { user: mailConfig.user, pass: mailConfig.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transport;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const ACK_SUBJECT = "Application Received – ASTRORIZE";
export const ACK_TEXT = `Dear Applicant,

Thank you for your interest in joining ASTRORIZE and for submitting your application.

We are pleased to confirm that we have successfully received your application. Our HR team will review your profile and evaluate your suitability for the applied position.

If your qualifications and experience align with our requirements, our team will get in touch with you regarding the next steps in the recruitment and interview process.

We appreciate your interest in being a part of ASTRORIZE and thank you for considering us as your potential employer.

Best Regards,
Team ASTRORIZE
careers@astrorize.com
www.astrorize.com

This is an automated acknowledgement. Please do not reply to this email.
`;

export interface ApplicationMail {
  name: string;
  email: string;
  phone: string | null;
  area: string;
  subject: string;
  message: string;
  resumeName: string;
  resumeType: string;
  resume: Buffer;
}

/**
 * Emails the application (with the resume attached) to careers@ and hr@, then the acknowledgement to
 * the candidate. Returns what happened; never throws (the application is already saved).
 */
export async function sendApplicationEmails(a: ApplicationMail): Promise<{ team: boolean; candidate: boolean }> {
  if (!mailConfigured()) {
    console.warn("Careers email is off: set SMTP_HOST, SMTP_USER and SMTP_PASS to email applications and acknowledgements.");
    return { team: false, candidate: false };
  }
  const t = transporter();
  const result = { team: false, candidate: false };

  try {
    await t.sendMail({
      from: `ASTRORIZE Careers <${mailConfig.from}>`,
      to: mailConfig.to,
      // HR can answer the candidate straight from their mail app.
      replyTo: `${a.name.replace(/[<>"]/g, "")} <${a.email}>`,
      subject: `New application (${a.area}): ${a.subject}`,
      text: [
        `A new application came in from the Careers page.`,
        ``,
        `Name: ${a.name}`,
        `Email: ${a.email}`,
        `Phone: ${a.phone ?? "—"}`,
        `Role type: ${a.area}`,
        `Subject: ${a.subject}`,
        ``,
        `Message:`,
        a.message,
        ``,
        `The resume is attached (${a.resumeName}).`,
      ].join("\n"),
      html: `<p>A new application came in from the Careers page.</p>
<table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
<tr><td><b>Name</b></td><td>${esc(a.name)}</td></tr>
<tr><td><b>Email</b></td><td>${esc(a.email)}</td></tr>
<tr><td><b>Phone</b></td><td>${esc(a.phone ?? "—")}</td></tr>
<tr><td><b>Role type</b></td><td>${esc(a.area)}</td></tr>
<tr><td><b>Subject</b></td><td>${esc(a.subject)}</td></tr>
</table>
<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap"><b>Message</b><br>${esc(a.message)}</p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#555">The resume is attached (${esc(a.resumeName)}).</p>`,
      attachments: [{ filename: a.resumeName, content: a.resume, contentType: a.resumeType }],
    });
    result.team = true;
  } catch (e) {
    console.error("Careers: couldn't email the application to the team:", e instanceof Error ? e.message : e);
  }

  try {
    await t.sendMail({
      from: `ASTRORIZE Careers <${mailConfig.from}>`,
      to: a.email,
      replyTo: mailConfig.ackReplyTo,
      subject: ACK_SUBJECT,
      text: ACK_TEXT,
      headers: { "Auto-Submitted": "auto-replied", Precedence: "bulk" },
    });
    result.candidate = true;
  } catch (e) {
    console.error("Careers: couldn't send the acknowledgement:", e instanceof Error ? e.message : e);
  }
  return result;
}
