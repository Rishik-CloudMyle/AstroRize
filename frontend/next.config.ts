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
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
