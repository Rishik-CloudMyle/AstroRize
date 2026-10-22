import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { HttpError, isDatabaseDown } from "./lib/errors.ts";
import { loadSession } from "./middleware/auth.ts";
import { adminRouter } from "./routes/admin/index.ts";
import { astroRouter } from "./routes/astro.ts";
import { authRouter } from "./routes/auth.ts";
import { catalogRouter } from "./routes/catalog.ts";
import { customerRouter } from "./routes/customer.ts";
import { mediaRouter } from "./routes/media.ts";
import { notificationsRouter } from "./routes/notifications.ts";
import { offersRouter } from "./routes/offers.ts";
import { portalRouter } from "./routes/portal.ts";
import { statsRouter } from "./routes/stats.ts";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // The website proxies /api/* to this server; trust its forwarded client IP.
  app.set("trust proxy", 1);
  // Basic browser safety headers on every API answer.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Browsers may only call the API from the Astrorize website.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === config.frontendOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Opening the API address in a browser shows this instead of "Cannot GET /".
  app.get("/", (_req, res) => {
    res.json({ name: "Astrorize API", status: "running", health: "/api/health", example: "/api/astrologers" });
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      return res.status(503).json({ ok: false, database: "unreachable" });
    }
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use("/api", loadSession);
  app.use("/api/auth", authRouter);
  app.use("/api/astro", astroRouter);
  app.use("/api", catalogRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/portal", portalRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/offers", offersRouter);
  app.use("/api", customerRouter);

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "not_found", message: "No such API route." } }));

  // One place turns errors into JSON the website can show.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return res.status(400).json({ error: { code: "invalid_input", message: first?.message ?? "Invalid input.", field: first?.path.join(".") } });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    // Malformed JSON or an oversized body: the request's fault, not the server's.
    const status = (err as { status?: number; type?: string } | null)?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const tooLarge = status === 413;
      return res.status(status).json({ error: { code: "bad_request", message: tooLarge ? "That request is too large." : "The request couldn't be read." } });
    }
    if (isDatabaseDown(err)) {
      console.error("Database unreachable. Is it running? (npm run db)");
      return res.status(503).json({ error: { code: "unavailable", message: "We're having trouble right now. Please try again in a moment." } });
    }
    console.error(err);
    res.status(500).json({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } });
  });

  return app;
}
