import path from "node:path";
import type { NextConfig } from "next";

// The Node API (../backend) runs as its own server. The website forwards every
// /api/* request to it, so the browser only ever talks to one address and the
// session cookie stays first-party.
const backend = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (for the combined dev scripts), so tell
  // Turbopack this folder is the app root rather than letting it pick the parent.
  turbopack: { root: path.join(__dirname) },
  experimental: {
    // Don't keep the dev compiler's cache on disk between runs. This project lives in a
    // OneDrive folder, and a half-written cache (sync locks, a crash, a forced stop) made
    // `next dev` serve 404s for pages that exist. Each `npm run dev` now starts fresh.
    turbopackFileSystemCacheForDev: false,
    // Uploads pass through the /api rewrite, which buffers request bodies (10 MB by default).
    // Intro videos go up to 50 MB and message videos to 25 MB, so allow a little over 50 MB.
    proxyClientMaxBodySize: "52mb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
