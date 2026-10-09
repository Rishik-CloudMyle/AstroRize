import { Router } from "express";
import { notFound } from "../lib/errors.ts";
import { UPLOAD_DIR, mediaContentType } from "../lib/media.ts";

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
    if (!err) return;
    if ((err as { code?: string }).code === "ENOENT" || (err as { status?: number }).status === 404) {
      res.setHeader("Cache-Control", "no-store");
      return next(notFound("No such file."));
    }
    next(err);
  });
});
