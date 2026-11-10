// Browser-only image and video helpers for card setup (TECH_PLAN §14: logo 256px WebP,
// background 1200×600 WebP, video ≤30 s and ≤20 MB with a poster frame captured here).

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

/** Portfolio photo: the whole photo at up to 1600px on its long edge, plus a 400px square thumbnail. */
export async function preparePortfolio(file: File): Promise<{ url: string; thumbUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  const img = await loadImage(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (Math.max(iw, ih) < 400) throw new Error("Use a photo at least 400px wide.");
  // Each upload must stay under the 1 MB request limit; step down until it fits.
  let url = "";
  for (const edge of [1600, 1400, 1200, 1000]) {
    const scale = Math.min(1, edge / Math.max(iw, ih));
    url = toWebp(img, iw, ih, 0, 0, Math.round(iw * scale), Math.round(ih * scale), 0.8);
    if (url.length < 850_000) break;
  }
  return { url, thumbUrl: cropTo(img, 400, 400) };
}

/** Scales a photo down to `edge` px on its long side, stepping down until it stays under ~850 KB. */
async function fitPhoto(file: File, edges: number[]): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  const img = await loadImage(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (Math.max(iw, ih) < 400) throw new Error("Use a photo at least 400px wide.");
  let url = "";
  for (const edge of edges) {
    const scale = Math.min(1, edge / Math.max(iw, ih));
    url = toWebp(img, iw, ih, 0, 0, Math.round(iw * scale), Math.round(ih * scale), 0.8);
    if (url.length < 850_000) break;
  }
  return url;
}

/** The business page's hero: the whole photo (cropped on screen around its focal point). */
export function prepareHero(file: File): Promise<string> {
  return fitPhoto(file, [1920, 1600, 1400, 1200]);
}

/** About photo: up to 1600px on its long side (shown uncropped, so tall photos stay sharp too). */
export function prepareAbout(file: File): Promise<string> {
  return fitPhoto(file, [1600, 1400, 1200, 1000]);
}

/** Service photo: 4:3, 800 × 600. Team photo: square, 600 × 600. */
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
export async function uploadMedia(file: Blob, kind: MediaKind): Promise<string> {
  const sb = browserClient();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (user) {
    const bucket = file.type.startsWith("video/") ? "videos" : "images";
    const path = `${user.id}/${kind}/${crypto.randomUUID()}.${EXT[file.type] ?? "bin"}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw new Error(/size|large/i.test(error.message) ? "That file is too big. Try a smaller one." : "That upload didn't go through. Try again.");
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const res = await fetch("/api/demo/media", { method: "POST", body: file, headers: { "Content-Type": file.type } });
  const r = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
  if (!r.ok || !r.url) throw new Error(r.error ?? "That upload didn't go through. Try again.");
  return r.url;
}

/** A prepared photo (a WebP data URL from the helpers above) uploaded to storage. */
export async function uploadPhoto(dataUrl: string, kind: MediaKind): Promise<string> {
  return uploadMedia(await (await fetch(dataUrl)).blob(), kind);
}

/** Refuses HEVC ("High Efficiency" iPhone video): many Android phones can't play it. */
export async function checkPlayable(file: File): Promise<void> {
  if (videoCodec(new Uint8Array(await file.arrayBuffer())) === "hevc") throw new Error(HEVC_PROBLEM);
}
