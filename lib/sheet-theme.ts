// The booking sheet wears the business page's own colours, never Tikka's (design/BRAND.md, "The business
// page"). The sheet is a <dialog> beside the page, so it doesn't inherit the page style's variables:
// it gets the same palette here, as overrides of the tokens its classes already use, plus the
// business's brand colour as the accent (selected day, time and option, the progress bar, the main button).
// Each palette mirrors its style in components/business/styles/styles.css and photo/photo.css.

import { contrast } from "@/lib/color";
import type { PageStyle } from "@/lib/types";

export interface SheetTheme {
  tone: "light" | "dark";
  vars: Record<string, string>;
}

interface Palette {
  tone: "light" | "dark";
  /** The background as a plain hex, to check the accent against. */
  hex: string;
  bg: string;
  raised: string;
  sunken: string;
  ink: string;
  muted: string;
  line: string;
  strong: string;
}

const DARK = (bg: string, raised: string, sunken: string, paper: string, rgb: string): Palette => ({
  tone: "dark",
  hex: bg,
  bg,
  raised,
  sunken,
  ink: paper,
  muted: `rgba(${rgb},.64)`,
  line: `rgba(${rgb},.14)`,
  strong: `rgba(${rgb},.42)`,
});

const PALETTES: Record<string, Palette> = {
  // The editorial page (beauty): its own light surface.
  beauty: { tone: "light", hex: "#FAF7F2", bg: "#FAF7F2", raised: "#FFFFFF", sunken: "#F1ECE4", ink: "#17112F", muted: "#5E5873", line: "#E4DDD2", strong: "#8C8399" },
  luxe: DARK("#0E0C0B", "#161311", "#080706", "#F4ECE4", "244,236,228"),
  soft: {
    tone: "light",
    hex: "#FBF8F6",
    bg: "color-mix(in oklab, var(--biz) 5%, #FBF8F6)",
    raised: "#FFFFFF",
    sunken: "color-mix(in oklab, var(--biz) 12%, #FFFFFF)",
    ink: "#24181D",
    muted: "#6E5F65",
    line: "color-mix(in oklab, var(--biz) 14%, #EDE6E3)",
    strong: "#A3959B",
  },
  portfolio: { tone: "light", hex: "#F5F4F1", bg: "#F5F4F1", raised: "#FFFFFF", sunken: "#ECEAE5", ink: "#151515", muted: "#6B6966", line: "#DEDBD5", strong: "#9B9894" },
  film: DARK("#0C0C0C", "#161616", "#070707", "#EDEAE4", "237,234,228"),
  "photography-dark": DARK("#0C0C0C", "#161616", "#070707", "#F5F4F1", "245,244,241"),
  "photography-light": { tone: "light", hex: "#F5F4F1", bg: "#F5F4F1", raised: "#FFFFFF", sunken: "#ECEAE5", ink: "#151515", muted: "#696865", line: "#DEDBD5", strong: "#9B9894" },
};

/** Below this the brand colour would vanish into the background, so the sheet uses its text colour instead. */
const MIN_ACCENT_CONTRAST = 1.6;

export function sheetTheme(look: PageStyle, galleryTone: "dark" | "light" | undefined, brand: string, onBrand: string): SheetTheme {
  const key = look === "photography" ? `photography-${galleryTone ?? "dark"}` : look;
  const p = PALETTES[key] ?? PALETTES.beauty;
  const dark = p.tone === "dark";
  const readable = /^#[0-9a-f]{6}$/i.test(brand) && contrast(brand, p.hex) >= MIN_ACCENT_CONTRAST;
  return {
    tone: p.tone,
    vars: {
      "--biz": brand,
      "--surface": p.bg,
      "--surface-raised": p.raised,
      "--surface-sunken": p.sunken,
      "--ink": p.ink,
      "--ink-muted": p.muted,
      "--line": p.line,
      "--line-strong": p.strong,
      // Tikka's gold and indigo stay off the business's page: notes go neutral, focus takes the accent.
      "--gold-soft": p.sunken,
      "--gold-text": p.muted,
      "--success": dark ? "#7CCB9F" : "#2F7A55",
      "--danger": dark ? "#FF9A8C" : "#B42318",
      "--danger-soft": dark ? "rgba(255,120,100,.14)" : "#FDE7E4",
      "--bf-acc": readable ? brand : p.ink,
      "--bf-on-acc": readable ? onBrand : p.hex,
      "--focus-ring": readable ? brand : p.ink,
    },
  };
}
