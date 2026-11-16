"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Film, ImagePlus, Loader2, Lock, Play, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  addPhoto,
  addVideoAction,
  filePhotosAction,
  orderCollectionsAction,
  removeCollectionAction,
  saveCollectionAction,
  savePortfolio,
  type CollectionsResult,
} from "@/app/app/actions";
import { capturePoster, preparePortfolio, uploadPhoto } from "@/lib/media-client";
import { sendVideo, stageLabel, type VideoStage } from "@/lib/video-upload";
import { PAGE_LIMITS, videoProblem } from "@/lib/page";
import { COLLECTION_NAME_MAX, collectionNameProblem, planMessage, PORTFOLIO_OPEN, type PortfolioPlan } from "@/lib/portfolio";
import type { PortfolioCollection, PortfolioPhoto, ServiceItem } from "@/lib/types";
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

/** Which photos the list shows: everything, one collection, or the ones in no collection. */
type Showing = "all" | "none" | string;

const TONE = {
  open: { box: "border-success/30 bg-success-soft", icon: "text-success", Icon: Check },
  free: { box: "border-line bg-brand-soft", icon: "text-brand", Icon: Sparkles },
  locked: { box: "border-line bg-surface-sunken", icon: "text-ink-muted", Icon: Lock },
} as const;

/**
 * Portfolio photos and short videos for the business page, sorted into collections ("Bridal",
 * "Gele") while a paid drop keeps them open (PRD A5). Each change saves on its own. The server
 * decides what's allowed; this only shows it.
 */
export function PortfolioEditor({
  initial,
  initialCollections,
  plan,
  services,
  slug,
}: {
  initial: PortfolioPhoto[];
  initialCollections: PortfolioCollection[];
  plan: PortfolioPlan;
  services: ServiceItem[];
  slug: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [collections, setCollections] = useState(initialCollections);
  const [captions, setCaptions] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((p) => [p.id, p.caption ?? ""])));
  const [showing, setShowing] = useState<Showing>("all");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [stage, setStage] = useState<VideoStage>();

  const open = plan.open;
  const current = collections.find((c) => c.id === showing);
  const known = new Set(collections.map((c) => c.id));
  const inNone = (p: PortfolioPhoto) => !p.collectionId || !known.has(p.collectionId);
  const shown = showing === "all" ? photos : current ? photos.filter((p) => p.collectionId === current.id) : photos.filter(inNone);
  const videos = photos.filter((p) => p.kind === "video").length;
  const room = Math.max(0, plan.items - photos.length);
  const message = planMessage(plan, { items: photos.length, collections: collections.length });
  const tone = TONE[message.tone];
  /** New uploads go into the collection being looked at, while collections are open. */
  const into = open && current ? current.id : undefined;

  function apply(r: CollectionsResult): boolean {
    if (!r.ok) {
      setProblem(r.error);
      return false;
    }
    setPhotos(r.portfolio);
    setCollections(r.collections);
    return true;
  }
  const run = (action: () => Promise<CollectionsResult>, then?: (r: CollectionsResult & { ok: true }) => void) => {
    setProblem(undefined);
    start(async () => {
      const r = await action();
      if (apply(r) && r.ok) then?.(r);
    });
  };

  async function uploadVideo(file?: File) {
    if (!file) return;
    setProblem(undefined);
    setVideoBusy(true);
    try {
      const { video, seconds } = await readClip(file);
      const tooMuch = videoProblem(photos, seconds, file.size, plan);
      if (tooMuch) throw new Error(tooMuch);
      // Too big for a server action: the file goes straight to Bunny Stream (or Storage) and its frame
      // to Storage, then we save the links.
      const [url, thumbUrl] = await Promise.all([
        sendVideo(file, "portfolio", seconds, setStage),
        capturePoster(video, Math.min(1, seconds / 2)).then((t) => uploadPhoto(t, "portfolio")),
      ]);
      const saved = await addVideoAction({ url, thumbUrl, seconds, collectionId: into });
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

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setProblem(undefined);
    const picked = [...files].slice(0, room);
    if (files.length > room) setProblem(`Up to ${plan.items} photos and videos. Added the first ${room}.`);
    setBusy(picked.length);
    for (const file of picked) {
      try {
        const prepared = await preparePortfolio(file);
        const [url, thumbUrl] = await Promise.all([uploadPhoto(prepared.url, "portfolio"), uploadPhoto(prepared.thumbUrl, "portfolio")]);
        const res = await addPhoto({ url, thumbUrl, collectionId: into });
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

  function create() {
    const bad = collectionNameProblem(newName, collections.map((c) => c.name));
    if (bad) return setProblem(bad);
    const before = new Set(collections.map((c) => c.id));
    run(
      () => saveCollectionAction({ name: newName }),
      (r) => {
        setAdding(false);
        setNewName("");
        setShowing(r.collections.find((c) => !before.has(c.id))?.id ?? "all");
      },
    );
  }

  function move(by: number) {
    if (!current) return;
    const ids = collections.map((c) => c.id);
    const i = ids.indexOf(current.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => orderCollectionsAction(ids));
  }

  async function copyLink() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(`https://usetikka.com/${slug}/work/${current.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setProblem("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  const chip = (id: Showing, label: string, n: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={showing === id}
      onClick={() => (setShowing(id), setAdding(false), setProblem(undefined))}
      className={`text-label inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border px-4 ${
        showing === id ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised text-ink"
      }`}
    >
      {label}
      <span className={`text-caption ${showing === id ? "opacity-80" : "text-ink-muted"}`}>{n}</span>
    </button>
  );

  return (
    <div className="grid gap-4">
      <div className={`flex gap-3 rounded-md border p-3 ${tone.box}`}>
        <tone.Icon size={18} className={`mt-0.5 shrink-0 ${tone.icon}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-label">{message.title}</p>
          <p className="text-caption text-ink-muted">{message.body}</p>
          {!open && (
            <Link href="/app/drops/new" className="text-label mt-2 inline-flex min-h-11 items-center text-brand underline">
              Run a drop
            </Link>
          )}
        </div>
      </div>

      <p className="text-caption text-ink-muted">
        {photos.length} of {Math.max(plan.items, photos.length)} photos and videos
        {VIDEO_UPLOADS ? ` (${plan.videos} videos at most, ${PAGE_LIMITS.videoSeconds} seconds each)` : ""}. People tap to see them full screen.
      </p>

      {/* Collections: only once there are some, or they can be made. */}
      {(open || collections.length > 0) && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Collections">
          {chip("all", "All", photos.length)}
          {collections.map((c) => chip(c.id, c.name, photos.filter((p) => p.collectionId === c.id).length))}
          {collections.length > 0 && chip("none", "Not sorted", photos.filter(inNone).length)}
          {open && collections.length < PORTFOLIO_OPEN.collections && (
            <button
              type="button"
              onClick={() => (setAdding(true), setProblem(undefined))}
              className="text-label inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border-2 border-dashed border-line-strong px-4 text-brand"
            >
              <Plus size={16} aria-hidden="true" />
              New collection
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="grid gap-2 rounded-md border border-line p-3">
          <label className="grid gap-1.5">
            <span className="text-label">Name your collection</span>
            <input
              className="input"
              autoFocus
              value={newName}
              maxLength={COLLECTION_NAME_MAX}
              placeholder="Bridal, Gele, Before and after"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={create} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Create
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {current && (
        <CollectionCard
          key={current.id}
          collection={current}
          open={open}
          pending={pending}
          services={services}
          slug={slug}
          copied={copied}
          first={collections[0]?.id === current.id}
          last={collections[collections.length - 1]?.id === current.id}
          onSave={(patch) => run(() => saveCollectionAction({ id: current.id, name: current.name, serviceName: current.serviceName, coverId: current.coverId, ...patch }))}
          onMove={move}
          onCopy={copyLink}
          onRemove={() => run(() => removeCollectionAction(current.id), () => setShowing("all"))}
          others={collections.filter((c) => c.id !== current.id).map((c) => c.name)}
          onProblem={setProblem}
        />
      )}

      {(shown.length > 0 || room > 0) && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p, i) => {
            const isCover = !!current && (current.coverId ? current.coverId === p.id : shown[0]?.id === p.id);
            return (
              <li key={p.id} className="flex gap-3 rounded-md border border-line p-2">
                <span className="relative size-20 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl} alt={`${p.kind === "video" ? "Video" : "Photo"} ${i + 1}`} className="size-full rounded-sm object-cover" />
                  {p.kind === "video" && (
                    <span className="absolute left-1 top-1 grid size-6 place-items-center rounded-pill bg-night/70 text-on-night" aria-hidden="true">
                      <Play size={12} className="fill-current" />
                    </span>
                  )}
                  {isCover && (
                    <span className="text-caption absolute inset-x-0 bottom-0 rounded-b-sm bg-night/75 py-0.5 text-center text-on-night">Cover</span>
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
                  {open && collections.length > 0 && (
                    <select
                      className="input h-11 text-[15px]"
                      aria-label={`Collection for photo ${i + 1}`}
                      value={p.collectionId && known.has(p.collectionId) ? p.collectionId : ""}
                      disabled={pending}
                      onChange={(e) => run(() => filePhotosAction([p.id], e.target.value || null))}
                    >
                      <option value="">Not sorted</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex flex-wrap gap-x-4">
                    {open && current && !isCover && p.kind !== "video" && (
                      <button
                        type="button"
                        className="text-label inline-flex min-h-11 items-center gap-1.5 text-brand"
                        disabled={pending}
                        onClick={() => run(() => saveCollectionAction({ id: current.id, name: current.name, serviceName: current.serviceName, coverId: p.id }))}
                      >
                        <Star size={16} aria-hidden="true" />
                        Make cover
                      </button>
                    )}
                    <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 text-danger" onClick={() => persist(photos.filter((x) => x.id !== p.id))}>
                      <Trash2 size={16} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {/* Always the next tile in the list, so it's clear more can go in (up to the limit). */}
          {room > 0 && (open || !current) && (
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
                    {busy > 0 ? `Adding ${busy} photo${busy === 1 ? "" : "s"}…` : into ? `Add photos to ${current!.name}` : photos.length ? "Add more photos" : "Add photos"}
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
      {current && shown.length === 0 && !open && <p className="text-caption text-ink-muted">Nothing in this collection, so it isn&apos;t on your page.</p>}

      {VIDEO_UPLOADS && room > 0 && videos < plan.videos && (open || !current) && (
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => videoInput.current?.click()} disabled={videoBusy}>
          {videoBusy ? <Loader2 className="animate-spin" /> : <Film />}
          {videoBusy ? (stageLabel(stage) ?? "Adding video…") : into ? `Add a video to ${current!.name}` : "Add a video"}
        </button>
      )}
      {problem && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {problem}
        </p>
      )}

      {message.tone === "free" && photos.length >= 2 && <Example photos={photos} services={services} />}

      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => uploadVideo(e.target.files?.[0])} />
    </div>
  );
}

/** One collection's settings: its name, what its Book button asks for, its link, its place in the order. */
function CollectionCard({
  collection: c,
  open,
  pending,
  services,
  slug,
  copied,
  first,
  last,
  others,
  onSave,
  onMove,
  onCopy,
  onRemove,
  onProblem,
}: {
  collection: PortfolioCollection;
  open: boolean;
  pending: boolean;
  services: ServiceItem[];
  slug: string;
  copied: boolean;
  first: boolean;
  last: boolean;
  others: string[];
  onSave: (patch: { name?: string; serviceName?: string }) => void;
  onMove: (by: number) => void;
  onCopy: () => void;
  onRemove: () => void;
  onProblem: (p?: string) => void;
}) {
  const [name, setName] = useState(c.name);
  const [confirming, setConfirming] = useState(false);
  const serviceNames = services.map((s) => s.name);
  const service = c.serviceName && serviceNames.includes(c.serviceName) ? c.serviceName : "";

  function rename() {
    if (name.trim() === c.name) return;
    const bad = collectionNameProblem(name, others);
    if (bad) return onProblem(bad);
    onSave({ name: name.trim() });
  }

  return (
    <div className="grid gap-3 rounded-md border border-line bg-surface-sunken p-3">
      {open ? (
        <>
          <label className="grid gap-1.5">
            <span className="text-label">Collection name</span>
            <input className="input" value={name} maxLength={COLLECTION_NAME_MAX} onChange={(e) => setName(e.target.value)} onBlur={rename} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-label">Its Book button asks for</span>
            <select className="input" value={service} disabled={pending} onChange={(e) => onSave({ serviceName: e.target.value || undefined })}>
              <option value="">An appointment (no service)</option>
              {serviceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {!serviceNames.length && <span className="text-caption text-ink-muted">Add your services above to pick one here.</span>}
          </label>
        </>
      ) : (
        <p className="text-label flex items-center gap-1.5">
          <Lock size={14} className="text-ink-muted" aria-hidden="true" />
          {c.name}
        </p>
      )}

      <div className="grid gap-1.5">
        <span className="text-label">Its own link</span>
        <div className="flex items-start gap-2">
          {/* The whole link, wrapping on a phone: unbroken, it would push the page wider than the screen. */}
          <span className="text-caption min-w-0 flex-1 break-all rounded-sm border border-line bg-surface-raised px-3 py-2.5 font-mono">
            usetikka.com/{slug}/work/{c.slug}
          </span>
          <button type="button" className="btn btn-secondary shrink-0" onClick={onCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <span className="text-caption text-ink-muted">Share it on WhatsApp or Instagram to show only this work.</span>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 text-ink disabled:opacity-40" disabled={first || pending} onClick={() => onMove(-1)}>
            <ArrowLeft size={16} aria-hidden="true" />
            Move earlier
          </button>
          <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 text-ink disabled:opacity-40" disabled={last || pending} onClick={() => onMove(1)}>
            Move later
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          {confirming ? (
            <span className="flex flex-wrap items-center gap-x-3">
              <span className="text-caption text-ink-muted">Its photos stay on your page.</span>
              <button type="button" className="text-label inline-flex min-h-11 items-center text-danger" disabled={pending} onClick={onRemove}>
                Yes, remove
              </button>
              <button type="button" className="text-label inline-flex min-h-11 items-center text-ink" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 text-danger" onClick={() => setConfirming(true)}>
              <Trash2 size={16} aria-hidden="true" />
              Remove collection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Free pages: what collections would look like, with the owner's own photos. */
function Example({ photos, services }: { photos: PortfolioPhoto[]; services: ServiceItem[] }) {
  const names = [services[0]?.name ?? "Your best work", services[1]?.name ?? "Before and after"];
  return (
    <div className="grid gap-2 rounded-md border border-dashed border-line-strong p-3">
      <p className="text-label">With a paid drop, your page could open like this</p>
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        {photos.slice(0, 2).map((p, i) => (
          <span key={p.id} className="relative block aspect-[4/5] overflow-hidden rounded-sm bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumbUrl} alt="" className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-night/85 to-transparent px-2.5 pb-2 pt-8 text-on-night">
              <span className="text-label block truncate">{names[i]}</span>
              <span className="text-caption block opacity-80">Tap to see more</span>
            </span>
          </span>
        ))}
      </div>
      <p className="text-caption text-ink-muted">
        An example with your photos. Customers tap a collection to see only that work and book it. Each one gets its own link to share.
      </p>
    </div>
  );
}
