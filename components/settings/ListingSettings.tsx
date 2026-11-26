"use client";

// Your Tikka listing: how the business shows in Tikka's search (docs/HOMEPAGE_PLAN.md). One thing per
// card, phone first: show me in search, where's your shop (a pin to drag), photos of your space.

import { Check, ExternalLink, ImagePlus, Loader2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveLocationAction, saveSpacePhotosAction, setListedAction } from "@/app/app/listing-actions";
import { TikkaMap } from "@/components/map/TikkaMap";
import { preparePortfolio, uploadPhoto } from "@/lib/media-client";
import type { SpacePhoto } from "@/lib/listing-db";

export function ListingSettings({
  slug,
  area,
  initial,
}: {
  slug: string;
  area: string;
  initial: { listed: boolean; lat?: number; lng?: number; approx: boolean; goesToCustomers: boolean; photos: SpacePhoto[] };
}) {
  const [listed, setListed] = useState(initial.listed);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [pinDirty, setPinDirty] = useState(false);
  const [approx, setApprox] = useState(initial.approx);
  const [photos, setPhotos] = useState<SpacePhoto[]>(initial.photos);
  const [uploading, setUploading] = useState(0);
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  function toggle() {
    const next = !listed;
    setListed(next);
    start(async () => {
      const r = await setListedAction(next);
      if (!r.ok) {
        setListed(!next);
        setProblem("That didn't save. Try again.");
      }
    });
  }

  function savePin() {
    if (!pin) return;
    start(async () => {
      const r = await saveLocationAction(pin.lat, pin.lng);
      if (r.ok) {
        setPinDirty(false);
        setApprox(false);
      } else setProblem("Put the pin on your shop in Nigeria, then save.");
    });
  }

  async function save(next: SpacePhoto[]) {
    setPhotos(next);
    const r = await saveSpacePhotosAction(next);
    if (!r.ok) setProblem("Those photos didn't save. Try again.");
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setProblem(undefined);
    const picked = [...files].slice(0, 6 - photos.length);
    setUploading(picked.length);
    let next = photos;
    for (const f of picked) {
      try {
        const prepared = await preparePortfolio(f);
        const [url, thumbUrl] = await Promise.all([uploadPhoto(prepared.url, "space"), uploadPhoto(prepared.thumbUrl, "space")]);
        next = [...next, { url, thumbUrl }];
      } catch (e) {
        setProblem((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    await save(next);
    if (file.current) file.current.value = "";
  }

  return (
    <div className="grid gap-4">
      <button type="button" aria-pressed={listed} disabled={pending} onClick={toggle} className="flex min-h-18 items-center gap-4 rounded-card border border-line bg-surface-raised px-4 py-4 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[17px]">Show me in Tikka&apos;s search</b>
          <span className="text-caption text-ink-muted">{listed ? "Customers find you on usetikka.com by service, place and time." : "Hidden from search. Your own website still works."}</span>
        </span>
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-pill p-0.5 transition-colors ${listed ? "bg-success" : "bg-line-strong"}`} aria-hidden="true">
          <span className={`size-6 rounded-pill bg-white shadow transition-transform ${listed ? "translate-x-5" : ""}`} />
        </span>
      </button>

      {!initial.goesToCustomers || pin ? (
        <section className="rounded-card border border-line bg-surface-raised p-4">
          <h2 className="text-title flex items-center gap-2">
            <MapPin size={20} aria-hidden="true" /> Where&apos;s your shop?
          </h2>
          <p className="text-caption mt-1 text-ink-muted">
            {approx ? `We put your pin near ${area} from your address. Drag it to your door, or tap the map, then save.` : "Drag the pin or tap the map to move it, then save."}
          </p>
          <TikkaMap
            className="mt-3 h-72 rounded-md"
            label="Your shop on the map"
            drag={{ lat: pin?.lat, lng: pin?.lng, onMove: (lat, lng) => (setPin({ lat, lng }), setPinDirty(true)) }}
          />
          <button type="button" onClick={savePin} disabled={!pin || !pinDirty || pending} className="btn btn-lg mt-3 w-full rounded-pill">
            {pending && pinDirty ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} {pinDirty ? "Save my pin" : approx ? "Move the pin to save it" : "Pin saved"}
          </button>
          {initial.goesToCustomers && <p className="text-caption mt-2 text-ink-muted">You go to customers, so search shows your area, not this pin.</p>}
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="text-title">Photos of your space</h2>
        <p className="text-caption mt-1 text-ink-muted">Your studio, your chairs, your front. Up to 6. They come first on your listing, then your work.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-md bg-surface-sunken">
              <img src={p.thumbUrl ?? p.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => start(() => save(photos.filter((x) => x !== p)))}
                className="absolute top-1 right-1 grid size-9 place-items-center rounded-pill bg-ink/70 text-surface"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <div key={`u${i}`} className="grid aspect-square place-items-center rounded-md bg-surface-sunken">
              <Loader2 className="animate-spin text-ink-muted" aria-hidden="true" />
            </div>
          ))}
          {photos.length + uploading < 6 && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-md border-2 border-dashed border-line-strong text-ink-muted">
              <span className="grid justify-items-center gap-1 text-[13px] font-semibold">
                <ImagePlus size={22} aria-hidden="true" /> Add
              </span>
              <input ref={file} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void add(e.target.files)} />
            </label>
          )}
        </div>
      </section>

      {problem && (
        <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
          {problem}
        </p>
      )}

      <Link href={`/book/${slug}`} className="btn btn-secondary btn-lg rounded-pill">
        <ExternalLink aria-hidden="true" /> See your listing
      </Link>
    </div>
  );
}
