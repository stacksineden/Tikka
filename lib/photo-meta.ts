// Photo details read in the owner's browser at upload, before the photo is shrunk to WebP (which
// keeps none of them): the camera settings from a JPEG's EXIF block, and the photo's main colour.
// Pure, so it's pinned by tests (lib/photo-meta.test.ts). Used by the Photography page style.

import type { PhotoCamera } from "./types";

const MAX = 48; // each value is short on screen; the database caps the whole object at 300 characters

function clean(s: string | undefined): string | undefined {
  const t = s?.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MAX) : undefined;
}

/** "Canon" + "Canon EOS R5" → "Canon EOS R5"; "NIKON CORPORATION" + "NIKON Z 8" → "NIKON Z 8"; "SONY" + "ILCE-7M4" → "SONY ILCE-7M4". */
export function cameraName(make?: string, model?: string): string | undefined {
  const mk = clean(make)?.replace(/\b(corporation|corp\.?|co\.,? ?ltd\.?|imaging|company)\b/gi, "").trim();
  const md = clean(model);
  if (!md) return mk || undefined;
  if (!mk) return md;
  return md.toLowerCase().startsWith(mk.split(" ")[0].toLowerCase()) ? md : clean(`${mk} ${md}`);
}

/** 1.8 → "f/1.8", 4 → "f/4". */
export function apertureText(f?: number): string | undefined {
  if (!f || !Number.isFinite(f) || f <= 0 || f > 128) return undefined;
  return `f/${Math.round(f * 10) / 10}`;
}

/** 0.005 → "1/200s", 0.4 → "1/2.5s"... seconds of 1 and over as "2s". */
export function shutterText(s?: number): string | undefined {
  if (!s || !Number.isFinite(s) || s <= 0 || s > 3600) return undefined;
  if (s >= 1) return `${Math.round(s * 10) / 10}s`;
  const d = 1 / s;
  return `1/${d >= 10 ? Math.round(d) : Math.round(d * 10) / 10}s`;
}

export function isoText(n?: number): string | undefined {
  return n && Number.isFinite(n) && n > 0 && n < 1_000_000 ? `ISO ${Math.round(n)}` : undefined;
}

/** "#rrggbb" from 0–255 channels. */
export function toneHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * The camera settings in a JPEG's EXIF block (APP1), or undefined when there are none (a PNG, a
 * screenshot, a photo saved from WhatsApp). Reads only the first bytes it's given; never throws.
 */
export function parseExif(buf: ArrayBuffer): PhotoCamera | undefined {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return undefined;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) return undefined;
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if (marker === 0xffda) return undefined; // image data starts: no EXIF before it
      off += 2 + size;
    }
  } catch {
    // a broken or cut-off block: no camera settings
  }
  return undefined;
}

type Tags = Map<number, number | string>;

function readTiff(v: DataView, start: number): PhotoCamera | undefined {
  const order = v.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return undefined;
  const le = order === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  if (u16(start + 2) !== 42) return undefined;

  const ifd = (at: number): Tags => {
    const tags: Tags = new Map();
    if (at < 0 || at + 2 > v.byteLength) return tags;
    const n = u16(at);
    for (let i = 0; i < n && i < 256; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const valueAt = e + 8;
      if (type === 2) { // ASCII
        const where = count > 4 ? start + u32(valueAt) : valueAt;
        let s = "";
        for (let k = 0; k < count && where + k < v.byteLength && k < 128; k++) s += String.fromCharCode(v.getUint8(where + k));
        tags.set(tag, s);
      } else if (type === 3) tags.set(tag, u16(valueAt)); // SHORT
      else if (type === 4) tags.set(tag, u32(valueAt)); // LONG
      else if (type === 5 || type === 10) { // RATIONAL / SRATIONAL
        const where = start + u32(valueAt);
        if (where + 8 <= v.byteLength) {
          const num = type === 5 ? u32(where) : v.getInt32(where, le);
          const den = type === 5 ? u32(where + 4) : v.getInt32(where + 4, le);
          if (den) tags.set(tag, num / den);
        }
      }
    }
    return tags;
  };

  const main = ifd(start + u32(start + 4));
  const exifAt = main.get(0x8769);
  const exif = typeof exifAt === "number" ? ifd(start + exifAt) : new Map();
  const str = (t: Tags, k: number) => (typeof t.get(k) === "string" ? (t.get(k) as string) : undefined);
  const num = (t: Tags, k: number) => (typeof t.get(k) === "number" ? (t.get(k) as number) : undefined);

  const out: PhotoCamera = {};
  const camera = cameraName(str(main, 0x010f), str(main, 0x0110));
  const lens = clean(str(exif, 0xa434));
  const aperture = apertureText(num(exif, 0x829d));
  const shutter = shutterText(num(exif, 0x829a));
  const iso = isoText(num(exif, 0x8827));
  if (camera) out.camera = camera;
  if (lens) out.lens = lens;
  if (aperture) out.aperture = aperture;
  if (shutter) out.shutter = shutter;
  if (iso) out.iso = iso;
  return Object.keys(out).length ? out : undefined;
}

/** The chips under a photo, in order. */
export function cameraChips(c?: PhotoCamera): string[] {
  if (!c) return [];
  return [c.camera, c.lens, c.aperture, c.shutter, c.iso].filter((x): x is string => !!x);
}
