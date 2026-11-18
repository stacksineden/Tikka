import type { MetadataRoute } from "next";

// Makes the dashboard installable ("Add to Home Screen"), which iPhones need for new lead alerts.
// Opens straight into the dashboard, full screen. Colours are the Tikka tokens (night, surface).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tikka",
    short_name: "Tikka",
    description: "Your Tikka dashboard: drops, leads and the counter.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#1B1440",
    icons: [
      { src: "/brand/tikka-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/tikka-app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/tikka-app-icon-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
  };
}
