// Browser-only image and video helpers for card setup (TECH_PLAN §14: logo 256px WebP,
// background 1200×600 WebP, video ≤30 s and ≤20 MB with a poster frame captured here).

import { SMALL_SUFFIX } from "./media-path";
import { LIMITS } from "./setup";
import { browserClient } from "./supabase/client";
import { HEVC_PROBLEM, videoCodec } from "./video-codec";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't an image we can read."));
    img.src = url;
  });
}

function toWebp(source: CanvasImageSource, sw: number, sh: number, sx: number, sy: number, w: number, h: number, quality = 0.82) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL("image/webp", quality);
}

/** Centre-crops to the target aspect ratio and scales down. */
function cropTo(img: HTMLImageElement, w: number, h: number) {
  const target = w / h;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const sw = iw / ih > target ? ih * target : iw;
  const sh = iw / ih > target ? ih : iw / target;
  return toWebp(img, sw, sh, (iw - sw) / 2, (ih - sh) / 2, w, h);
}

export async function prepareLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG or WebP).");
  const img = await loadImage(file);
  if (Math.min(img.naturalWidth, img.naturalHeight) < LIMITS.logoMinPx) {
    throw new Error(`Use a logo at least ${LIMITS.logoMinPx}px wide so it stays sharp.`);
  }
  return cropTo(img, 256, 256);
}

export async function prepareCover(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  const img = await loadImage(file);
  if (img.naturalWidth < 600) throw new Error("Use a photo at least 600px wide.");
  return cropTo(img, 1200, 600);
}

export interface VideoInfo {
  url: string;
  duration: number;
  video: HTMLVideoElement;
}

export function readVideo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    if (!/^video\/(mp4|quicktime)$/.test(file.type) && !/\.(mp4|mov)$/i.test(file.name)) {
      reject(new Error("Use an MP4 or MOV video."));
      return;
    }
    if (file.size > LIMITS.videoBytes) {
      reject(new Error("That video is over 20 MB. Trim it or export at a lower quality."));
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (video.duration > LIMITS.videoSeconds + 0.5) {
        reject(new Error(`Keep it to ${LIMITS.videoSeconds} seconds. This one is ${Math.round(video.duration)}.`));
        return;
      }
      resolve({ url, duration: video.duration, video });
    };
    video.onerror = () => reject(new Error("We couldn't read that video. Try another file."));
    video.src = url;
  });
}

/** Grabs the frame at `time` seconds as a 720px-wide WebP poster. */
export function capturePoster(video: HTMLVideoElement, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const grab = () => {
      const w = 720;
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 405;
      try {
        resolve(toWebp(video, video.videoWidth, video.videoHeight, 0, 0, w, h, 0.78));
      } catch {
        reject(new Error("We couldn't grab a frame from that video."));
      }
    };
    if (Math.abs(video.currentTime - time) < 0.05 && video.readyState >= 2) return grab();
    video.onseeked = grab;
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
  });
}

/**
 * A prepared photo: a WebP data URL, or the full photo with a phone copy beside it (uploaded
 * together; see smallOf() in lib/media-path.ts).
 */
export type Prepared = string | { full: string; small: string };

/** The phone copy: 1000px on the long side, kept under ~170 KB. */
const SMALL_EDGE = 1000;

/** Scales to `edge` px on the long side, lowering size then quality until under `budget` characters of data URL. */
function shrink(img: HTMLImageElement, edges: number[], budget: number): string {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  let url = "";
  for (const quality of [0.8, 0.72, 0.64]) {
    for (const edge of edges) {
      const scale = Math.min(1, edge / Math.max(iw, ih));
      url = toWebp(img, iw, ih, 0, 0, Math.round(iw * scale), Math.round(ih * scale), quality);
      if (url.length < budget) return url;
    }
  }
  return url;
}

async function readPhoto(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  const img = await loadImage(file);
  if (Math.max(img.naturalWidth, img.naturalHeight) < 400) throw new Error("Use a photo at least 400px wide.");
  return img;
}

// Budgets are data-URL characters (base64 is about 4/3 of the bytes): ~450 KB for a full photo,
// ~170 KB for a phone copy. The storage bucket refuses anything over 2 MB regardless.
const FULL_BUDGET = 600_000;
const SMALL_BUDGET = 230_000;

/** The full photo plus its phone copy. */
async function withSmall(file: File, edges: number[]): Promise<{ full: string; small: string }> {
  const img = await readPhoto(file);
  return { full: shrink(img, edges, FULL_BUDGET), small: shrink(img, [SMALL_EDGE, 900, 800], SMALL_BUDGET) };
}

/** Portfolio photo: the whole photo up to 1600px with a phone copy, plus a 400px square thumbnail. */
export async function preparePortfolio(file: File): Promise<{ url: Prepared; thumbUrl: string }> {
  const img = await readPhoto(file);
  return {
    url: { full: shrink(img, [1600, 1400, 1200, 1000], FULL_BUDGET), small: shrink(img, [SMALL_EDGE, 900, 800], SMALL_BUDGET) },
    thumbUrl: cropTo(img, 400, 400),
  };
}

/** The business page's hero: the whole photo (cropped on screen around its focal point). No phone
 *  copy: a phone shows a tall slice of a wide photo, so it needs the full height. */
export async function prepareHero(file: File): Promise<string> {
  return shrink(await readPhoto(file), [1920, 1600, 1400, 1200], FULL_BUDGET);
}

/** About photo: up to 1600px on its long side (shown uncropped), with a phone copy. */
export function prepareAbout(file: File): Promise<Prepared> {
  return withSmall(file, [1600, 1400, 1200, 1000]);
}

/** Service photo: the whole photo, up to 1600px (cropped on screen, never on upload), with a phone copy. */
export function prepareService(file: File): Promise<Prepared> {
  return withSmall(file, [1600, 1400, 1200, 1000]);
}

/** Team photo: square, 600 × 600. */
export async function prepareCropped(file: File, w: number, h: number): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  return cropTo(await loadImage(file), w, h);
}

/** What a file is for: its folder in storage ({user}/{kind}/{file}). */
export type MediaKind = "logo" | "background" | "video" | "video-poster" | "portfolio" | "hero" | "about" | "service" | "team";

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "video/mp4": "mp4", "video/quicktime": "mov" };

/**
 * Sends a prepared file to storage and returns its address. Signed in: straight from the browser
 * to Supabase Storage, into the person's own folder (the bucket's rules check it). DEMO (the demo
 * business, no account): the in-memory media route.
 */
export async function uploadMedia(file: Blob, kind: MediaKind, name?: string): Promise<string> {
  const sb = browserClient();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (user) {
    const bucket = file.type.startsWith("video/") ? "videos" : "images";
    const path = `${user.id}/${kind}/${name ?? `${crypto.randomUUID()}.${EXT[file.type] ?? "bin"}`}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw new Error(/size|large/i.test(error.message) ? "That file is too big. Try a smaller one." : "That upload didn't go through. Try again.");
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const res = await fetch("/api/demo/media", { method: "POST", body: file, headers: { "Content-Type": file.type } });
  const r = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
  if (!r.ok || !r.url) throw new Error(r.error ?? "That upload didn't go through. Try again.");
  return r.url;
}

/**
 * A prepared photo uploaded to storage; returns the full photo's address. With a phone copy, the
 * copy goes up first ("{id}.s-sm.webp"), then the photo ("{id}.s.webp"), so a saved photo always
 * has its copy. The demo store (no account) keeps the full photo only.
 */
export async function uploadPhoto(prepared: Prepared, kind: MediaKind): Promise<string> {
  const blob = async (d: string) => (await fetch(d)).blob();
  if (typeof prepared === "string") return uploadMedia(await blob(prepared), kind);
  const { data } = await browserClient().auth.getSession();
  if (!data.session?.user) return uploadMedia(await blob(prepared.full), kind);
  const id = crypto.randomUUID();
  await uploadMedia(await blob(prepared.small), kind, `${id}${SMALL_SUFFIX}`);
  return uploadMedia(await blob(prepared.full), kind, `${id}.s.webp`);
}

/** Refuses HEVC ("High Efficiency" iPhone video): many Android phones can't play it. */
export async function checkPlayable(file: File): Promise<void> {
  if (videoCodec(new Uint8Array(await file.arrayBuffer())) === "hevc") throw new Error(HEVC_PROBLEM);
}
