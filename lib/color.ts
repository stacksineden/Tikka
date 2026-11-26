// Brand-colour checks for the business card (BRAND.md: "Compute --on-biz as white or ink,
// whichever gives 4.5:1 on --biz; if neither does, darken --biz until one does").

/** The two text colours a card front may use: white, or Tikka's ink token. */
export const ON_WHITE = "#FFFFFF";
export const ON_INK = "#17112F";

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(input: string): string | null {
  const m = input.trim().match(HEX);
  return m ? "#" + m[1].toUpperCase() : null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return "#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export interface ColorCheck {
  /** Text colour to use on this brand colour. */
  on: string;
  ratio: number;
  ok: boolean;
  /** When neither white nor ink reaches 4.5:1: a darker shade that works with white. */
  suggestion?: string;
}

export function checkBrandColor(hex: string): ColorCheck {
  const white = contrast(hex, ON_WHITE);
  const ink = contrast(hex, ON_INK);
  const on = white >= ink ? ON_WHITE : ON_INK;
  const ratio = Math.max(white, ink);
  if (ratio >= 4.5) return { on, ratio, ok: true };

  const [h, s, l] = toHsl(hex);
  for (let light = l - 0.02; light > 0; light -= 0.02) {
    const candidate = fromHsl(h, s, light);
    if (contrast(candidate, ON_WHITE) >= 4.5) return { on, ratio, ok: false, suggestion: candidate };
  }
  return { on, ratio, ok: false, suggestion: ON_INK };
}

/** Suggested brand colours: all hold 4.5:1 with white text. None is WhatsApp green. */
export const SWATCHES = [
  { hex: "#9C3B5C", name: "Berry" },
  { hex: "#B4372F", name: "Clay" },
  { hex: "#7A4A12", name: "Cocoa" },
  { hex: "#0F5C4D", name: "Forest" },
  { hex: "#1E6F8C", name: "Lagoon" },
  { hex: "#1F3A93", name: "Royal" },
  { hex: "#5B2A86", name: "Plum" },
  { hex: "#2B2B2B", name: "Charcoal" },
] as const;

/**
 * The brand colour, darkened until it holds `min`:1 against white: for small text on a light card
 * and for QR codes, which scanners read best near black. Keeps the hue, so it still reads as theirs.
 */
export function deepen(hex: string, min = 7): string {
  const base = normalizeHex(hex) ?? ON_INK;
  if (contrast(base, ON_WHITE) >= min) return base;
  const [h, s, l] = toHsl(base);
  for (let light = l - 0.02; light > 0; light -= 0.02) {
    const candidate = fromHsl(h, s, light);
    if (contrast(candidate, ON_WHITE) >= min) return candidate;
  }
  return ON_INK;
}

/**
 * NEW DIRECTION: the brand colours offered at setup, dark to light. Each one is readable with white
 * or dark text (checkBrandColor picks which). None is WhatsApp green.
 */
export const BRAND_SWATCHES = [
  { hex: "#111111", name: "Black" },
  { hex: "#2B2B2B", name: "Charcoal" },
  { hex: "#14213D", name: "Navy" },
  { hex: "#1F3A93", name: "Royal" },
  { hex: "#1E6F8C", name: "Lagoon" },
  { hex: "#5DADE2", name: "Sky" },
  { hex: "#0F5C4D", name: "Forest" },
  { hex: "#0B7A5A", name: "Emerald" },
  { hex: "#5B2A86", name: "Plum" },
  { hex: "#B39DDB", name: "Lilac" },
  { hex: "#6D1A36", name: "Wine" },
  { hex: "#9C3B5C", name: "Berry" },
  { hex: "#C2185B", name: "Rose" },
  { hex: "#F4C2C2", name: "Blush" },
  { hex: "#B4372F", name: "Clay" },
  { hex: "#E76F51", name: "Coral" },
  { hex: "#7A4A12", name: "Cocoa" },
  { hex: "#C9A227", name: "Gold" },
  { hex: "#D8B49C", name: "Nude" },
  { hex: "#F3E9D2", name: "Cream" },
  { hex: "#FFFFFF", name: "White" },
] as const;

/** Colour words owners type ("wine", "baby pink"), beyond the swatch names. */
const COLOR_WORDS: Record<string, string> = {
  ...Object.fromEntries(BRAND_SWATCHES.map((s) => [s.name.toLowerCase(), s.hex])),
  ...Object.fromEntries(SWATCHES.map((s) => [s.name.toLowerCase(), s.hex])),
  red: "#C62828", maroon: "#6B1E24", burgundy: "#7B1E3A", pink: "#E91E63", babypink: "#F8BBD0", hotpink: "#E0218A", magenta: "#B0157A",
  purple: "#6A1B9A", violet: "#7E57C2", lavender: "#C5B3E6", orange: "#E8590C", peach: "#F6B99A", yellow: "#F2C230", mustard: "#C99A0E",
  green: "#2E7D32", olive: "#6B7A2A", mint: "#A8DCC6", teal: "#00796B", blue: "#1565C0", skyblue: "#5DADE2", royalblue: "#1F3A93",
  brown: "#6D4C2F", chocolate: "#4E2A14", tan: "#C19A6B", beige: "#E8D9C0", ivory: "#FAF6EC", grey: "#6B6B6B", gray: "#6B6B6B",
  silver: "#BDBDBD", rosegold: "#B76E79", champagne: "#E9D8B4", turquoise: "#1AA3A3",
};

/**
 * A colour as an owner might type it: a hex code ("#9C3B5C", "9c3b5c", "#abc") or a word ("wine",
 * "Baby pink", "rose gold"). Returns "#RRGGBB" or null when it isn't one we know.
 */
export function parseColor(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (short) return ("#" + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toUpperCase();
  return normalizeHex(t) ?? COLOR_WORDS[t.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

/** The name we show for a colour, when it's one of ours. */
export function colorName(hex: string): string | null {
  const h = hex.toUpperCase();
  return BRAND_SWATCHES.find((s) => s.hex === h)?.name ?? SWATCHES.find((s) => s.hex === h)?.name ?? null;
}
