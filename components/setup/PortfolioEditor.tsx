"use client";

import { Film, ImagePlus, Loader2, Play, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { addPhoto, addVideoAction, savePortfolio } from "@/app/app/actions";
import { capturePoster, preparePortfolio, uploadPhoto } from "@/lib/media-client";
import { sendVideo, stageLabel, type VideoStage } from "@/lib/video-upload";
import { PAGE_LIMITS, videoProblem } from "@/lib/page";
import { PORTFOLIO_MAX } from "@/lib/slug";
import type { PortfolioPhoto } from "@/lib/types";
import { VIDEO_UPLOADS } from "@/lib/features";

/** Short-video check in the browser (the server checks again): length from the file's metadata. */
function readClip(file: File): Promise<{ video: HTMLVideoElement; seconds: number }> {
  return new Promise((resolve, reject) => {
    if (!/^video\/(mp4|quicktime)$/.test(file.type)) return reject(new Error("Use an MP4 or MOV video."));
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve({ video, seconds: video.duration });
    video.onerror = () => reject(new Error("We couldn't read that video. Try another file."));
    video.src = URL.createObjectURL(file);
  });
}

/** Portfolio photos and short videos for the business page. Each item saves on its own, like an upload. */
export function PortfolioEditor({ initial }: { initial: PortfolioPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [captions, setCaptions] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((p) => [p.id, p.caption ?? ""])));
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState<string>();
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [stage, setStage] = useState<VideoStage>();
  const videos = photos.filter((p) => p.kind === "video").length;

  async function uploadVideo(file?: File) {
    if (!file) return;
    setProblem(undefined);
    setVideoBusy(true);
    try {
      const { video, seconds } = await readClip(file);
      const tooMuch = videoProblem(photos, seconds, file.size);
      if (tooMuch) throw new Error(tooMuch);
      // Too big for a server action: the file goes straight to Bunny Stream (or Storage) and its frame
      // to Storage, then we save the links.
      const [url, thumbUrl] = await Promise.all([
        sendVideo(file, "portfolio", seconds, setStage),
        capturePoster(video, Math.min(1, seconds / 2)).then((t) => uploadPhoto(t, "portfolio")),
      ]);
      const saved = await addVideoAction({ url, thumbUrl, seconds });
      if (!saved.ok) throw new Error(saved.error);
      setPhotos(saved.portfolio);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setVideoBusy(false);
      setStage(undefined);
      if (videoInput.current) videoInput.current.value = "";
    }
  }
  const room = PORTFOLIO_MAX - photos.length;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setProblem(undefined);
    const picked = [...files].slice(0, room);
    if (files.length > room) setProblem(`Up to ${PORTFOLIO_MAX} photos. Added the first ${room}.`);
    setBusy(picked.length);
    for (const file of picked) {
      try {
        const prepared = await preparePortfolio(file);
        const [url, thumbUrl] = await Promise.all([uploadPhoto(prepared.url, "portfolio"), uploadPhoto(prepared.thumbUrl, "portfolio")]);
        const res = await addPhoto({ url, thumbUrl });
        if (!res.ok) {
          setProblem(res.error);
          break;
        }
        setPhotos(res.portfolio);
      } catch (e) {
        setProblem((e as Error).message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  function persist(next: PortfolioPhoto[], nextCaptions = captions) {
    start(async () => {
      const saved = await savePortfolio(next.map((p) => ({ id: p.id, caption: nextCaptions[p.id] })));
      setPhotos(saved);
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-caption text-ink-muted">
        {VIDEO_UPLOADS
          ? `Up to ${PORTFOLIO_MAX} photos and videos of your work, space or products (${PAGE_LIMITS.videos} videos at most, ${PAGE_LIMITS.videoSeconds} seconds each).`
          : `Up to ${PORTFOLIO_MAX} photos of your work, space or products.`} People tap to see them full
        screen. {photos.length} of {PORTFOLIO_MAX}.
      </p>
      {(photos.length > 0 || room > 0) && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((p, i) => (
            <li key={p.id} className="flex gap-3 rounded-md border border-line p-2">
              <span className="relative size-20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt={`${p.kind === "video" ? "Video" : "Photo"} ${i + 1}`} className="size-full rounded-sm object-cover" />
                {p.kind === "video" && (
                  <span className="absolute left-1 top-1 grid size-6 place-items-center rounded-pill bg-night/70 text-on-night" aria-hidden="true">
                    <Play size={12} className="fill-current" />
                  </span>
                )}
              </span>
              <div className="grid min-w-0 flex-1 content-start gap-2">
                <input
                  className="input h-11 text-[15px]"
                  value={captions[p.id] ?? ""}
                  maxLength={80}
                  placeholder="Caption (optional)"
                  aria-label={`Caption for photo ${i + 1}`}
                  onChange={(e) => setCaptions((c) => ({ ...c, [p.id]: e.target.value }))}
                  onBlur={() => persist(photos)}
                />
                <button
                  type="button"
                  className="text-label inline-flex min-h-10 items-center gap-1.5 justify-self-start text-danger"
                  onClick={() => persist(photos.filter((x) => x.id !== p.id))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Remove
                </button>
              </div>
            </li>
          ))}
          {/* Always the next tile in the list, so it's clear more can go in (up to the limit). */}
          {room > 0 && (
            <li>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy > 0}
                className="flex min-h-24 w-full items-center gap-3 rounded-md border-2 border-dashed border-line-strong p-3 text-left text-ink hover:border-brand hover:bg-brand-soft disabled:opacity-70"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand">
                  {busy > 0 ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="text-label block">
                    {busy > 0 ? `Adding ${busy} photo${busy === 1 ? "" : "s"}…` : photos.length ? "Add more photos" : "Add photos"}
                  </span>
                  <span className="text-caption block text-ink-muted">
                    {photos.length ? `You can add ${room} more. Pick several at once.` : "Pick several at once from your phone."}
                  </span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
      {VIDEO_UPLOADS && room > 0 && videos < PAGE_LIMITS.videos && (
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => videoInput.current?.click()} disabled={videoBusy}>
          {videoBusy ? <Loader2 className="animate-spin" /> : <Film />}
          {videoBusy ? (stageLabel(stage) ?? "Adding video…") : "Add a video"}
        </button>
      )}
      {problem && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {problem}
        </p>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => uploadVideo(e.target.files?.[0])} />
    </div>
  );
}
