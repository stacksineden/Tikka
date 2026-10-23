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
