// Token values for places CSS variables can't reach (the @vercel/og images).
// Mirrors design/tokens.css (light theme); lib/tokens.test.ts fails if they drift.
export const TOKENS = {
  night: "#1B1440",
  nightRaised: "#2A2160",
  onNight: "#F6F3FF",
  onNightMuted: "#B3ABD6",
  brand: "#3E2BB0",
  gold: "#F4B63F",
  rarityCommon: "#C9C4E6",
  rarityLegendary: "#FF5C8A",
} as const;
