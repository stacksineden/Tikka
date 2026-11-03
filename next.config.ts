import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Let the dev server's scripts load through an ngrok link (someone testing on their phone). Dev only.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
  // Keep the dev button off the mobile tab bar.
  devIndicators: { position: "top-right" },
  // The business page lives at usetikka.com/[slug]; the old /b/[slug] address keeps working.
  async redirects() {
    return [{ source: "/b/:slug", destination: "/:slug", permanent: true }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
