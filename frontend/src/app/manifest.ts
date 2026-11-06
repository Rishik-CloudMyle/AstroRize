import type { MetadataRoute } from "next";

// Lets phones install the website as an app ("Install app" / "Add to home screen"): it then opens
// full screen with the AstroRize icon, like the client's app design.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AstroRize — Talk to India's Best Astrologers",
    short_name: "AstroRize",
    description: "Consult verified astrologers by chat, voice or video.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
