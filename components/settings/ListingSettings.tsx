"use client";

// Your Tikka listing (docs/HOMEPAGE_PLAN.md; supabase/migrations/20261218100000_listing_journey.sql).
// Not listed yet: "Get listed on Tikka", one decision per screen (the terms, photos of the space, the
// pin, the extras, check and list). Listed: the same parts as settings, plus leaving search. Phone
// first; the database checks everything again.

import { ArrowLeft, Check, ExternalLink, ImagePlus, Loader2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { acceptListingAction, saveListingExtrasAction, saveLocationAction, saveSpacePhotosAction, setListedAction } from "@/app/app/listing-actions";
import { TikkaMap } from "@/components/map/TikkaMap";
import { EXTRA_GROUPS, LANGUAGES, LISTING_TERMS, MISSING_TEXT, type ListingMissing } from "@/lib/listing";
import { preparePortfolio, uploadPhoto } from "@/lib/media-client";

export interface ListingPhoto {
  url: string;
  thumbUrl?: string;
}

interface Props {
  slug: string;
  area: string;
  goesToCustomers: boolean;
  listed: boolean;
  termsAt?: string;
  graceUntil?: string;
  missing: ListingMissing[];
  amenities: string[];
  languages: string[];
  lat?: number;
  lng?: number;
  approx: boolean;
  photos: ListingPhoto[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });

export function ListingSettings(p: Props) {
  return p.termsAt ? <Listed {...p} /> : <GetListed {...p} />;
}

/* ------------------------------------------------------------------ parts */

function Photos({ photos, setPhotos, onProblem }: { photos: ListingPhoto[]; setPhotos: (p: ListingPhoto[]) => void; onProblem: (t: string) => void }) {
  const [uploading, setUploading] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  async function save(next: ListingPhoto[]) {
    setPhotos(next);
    const r = await saveSpacePhotosAction(next);
    if (!r.ok) onProblem("Those photos didn't save. Try again.");
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const picked = [...files].slice(0, 6 - photos.length);
    setUploading(picked.length);
    let next = photos;
    for (const f of picked) {
      try {
        const prepared = await preparePortfolio(f);
        const [url, thumbUrl] = await Promise.all([uploadPhoto(prepared.url, "space"), uploadPhoto(prepared.thumbUrl, "space")]);
        next = [...next, { url, thumbUrl }];
      } catch (e) {
        onProblem((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    await save(next);
    if (file.current) file.current.value = "";
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((ph, i) => (
        <div key={ph.url} className="relative aspect-square overflow-hidden rounded-md bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ph.thumbUrl ?? ph.url} alt="" className="size-full object-cover" />
          <button
            type="button"
            aria-label={`Remove photo ${i + 1}`}
            onClick={() => void save(photos.filter((x) => x !== ph))}
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
  );
}

function Pin({ lat, lng, approx, area, onProblem }: { lat?: number; lng?: number; approx: boolean; area: string; onProblem: (t: string) => void }) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(lat != null && lng != null ? { lat, lng } : null);
  const [dirty, setDirty] = useState(false);
  const [isApprox, setApprox] = useState(approx);
  const [pending, start] = useTransition();
  function save() {
    if (!pin) return;
    start(async () => {
      const r = await saveLocationAction(pin.lat, pin.lng);
      if (r.ok) {
        setDirty(false);
        setApprox(false);
      } else onProblem("Put the pin on your shop in Nigeria, then save.");
    });
  }
  return (
    <div className="grid gap-3">
      <p className="text-caption text-ink-muted">
        {isApprox ? `We put your pin near ${area} from your address. Drag it to your door, or tap the map, then save.` : "Drag the pin or tap the map to move it, then save."}
      </p>
      <TikkaMap
        className="h-72 rounded-md"
        label="Your shop on the map"
        drag={{
          lat: pin?.lat,
          lng: pin?.lng,
          onMove: (la, ln) => {
            setPin({ lat: la, lng: ln });
            setDirty(true);
          },
        }}
      />
      <button type="button" onClick={save} disabled={!pin || !dirty || pending} className="btn btn-lg w-full rounded-pill">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} {dirty ? "Save my pin" : isApprox ? "Move the pin to save it" : "Pin saved"}
      </button>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-[14px] font-semibold ${on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}
    >
      {on && <Check size={15} aria-hidden="true" />}
      {children}
    </button>
  );
}

function Extras({ amenities, languages, onChange }: { amenities: string[]; languages: string[]; onChange: (a: string[], l: string[]) => void }) {
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div className="grid gap-5">
      {EXTRA_GROUPS.map((g) => (
        <fieldset key={g.id}>
          <legend className="text-label mb-2">{g.label}</legend>
          <div className="flex flex-wrap gap-2">
            {g.items.map((i) => (
              <Chip key={i.id} on={amenities.includes(i.id)} onClick={() => onChange(flip(amenities, i.id), languages)}>
                {i.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="text-label mb-2">Languages you speak with customers</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l.id} on={languages.includes(l.id)} onClick={() => onChange(amenities, flip(languages, l.id))}>
              {l.label}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Terms() {
  return (
    <ul className="grid gap-2.5">
      {LISTING_TERMS.map((t) => (
        <li key={t} className="text-body flex items-start gap-2.5">
          <Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Problem({ text }: { text?: string }) {
  return text ? (
    <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
      {text}
    </p>
  ) : null;
}

/* ------------------------------------------------------------------ not listed yet: the journey */

type Step = "terms" | "photos" | "pin" | "extras" | "check";

const TITLES: Record<Step, string> = {
  terms: "Get listed on Tikka",
  photos: "Photos of your space",
  pin: "Where's your shop?",
  extras: "What customers like to know",
  check: "Check and list",
};

function GetListed(p: Props) {
  const router = useRouter();
  const steps: Step[] = p.goesToCustomers ? ["terms", "extras", "check"] : ["terms", "photos", "pin", "extras", "check"];
  const [step, setStep] = useState<Step>("terms");
  const [agreed, setAgreed] = useState(false);
  const [photos, setPhotos] = useState(p.photos);
  const [amenities, setAmenities] = useState(p.amenities);
  const [languages, setLanguages] = useState(p.languages);
  const [problem, setProblem] = useState<string>();
  const [missing, setMissing] = useState<ListingMissing[]>(p.missing);
  const [pending, start] = useTransition();
  const i = steps.indexOf(step);
  const go = (s: Step) => {
    setProblem(undefined);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  // What's still missing, as far as the screen knows (the database decides on "List me").
  const shownMissing = missing.filter((m) => m !== "space_photo" || (!p.goesToCustomers && photos.length === 0));

  function next() {
    if (step === "extras") {
      start(async () => {
        const r = await saveListingExtrasAction(amenities, languages);
        if (!r.ok) setProblem("That didn't save. Try again.");
        else go(steps[i + 1]);
      });
      return;
    }
    go(steps[i + 1]);
  }

  function list() {
    start(async () => {
      const r = await acceptListingAction();
      if (r.ok) router.refresh();
      else if (r.missing) setMissing(r.missing);
      else setProblem("That didn't go through. Try again.");
    });
  }

  const ready: Record<Step, boolean> = { terms: agreed, photos: photos.length > 0, pin: true, extras: true, check: shownMissing.length === 0 };

  return (
    <div className="grid gap-5">
      {p.graceUntil && step === "terms" && (
        <p className="text-body rounded-md bg-gold-soft px-4 py-3">
          <b>You&apos;re in Tikka&apos;s search until the end of {day(new Date(new Date(p.graceUntil).getTime() - 1).toISOString())}.</b> Accept the listing terms to stay there.
        </p>
      )}
      <div className="flex min-h-11 items-center gap-2">
        {i > 0 && (
          <button type="button" onClick={() => go(steps[i - 1])} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-pill">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}
        <span className="text-serial font-mono text-ink-muted uppercase">
          Step {i + 1} of {steps.length}
        </span>
      </div>
      <h2 className="text-heading -mt-2">{TITLES[step]}</h2>

      {step === "terms" && (
        <>
          <p className="text-body-lg text-ink-muted">Customers search Tikka for a service near them, see a map, and book. Being listed puts you there, next to your own page.</p>
          <section className="rounded-card border border-line bg-surface-raised p-4">
            <h3 className="text-title mb-3">The terms</h3>
            <Terms />
          </section>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 shrink-0" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="text-body">
              I agree to the listing terms and Tikka&apos;s{" "}
              <Link href="/terms" target="_blank" className="underline">
                terms
              </Link>
              .
            </span>
          </label>
        </>
      )}

      {step === "photos" && (
        <>
          <p className="text-body-lg text-ink-muted">Your studio, your chairs, your front, so people know where they&apos;re going. Add at least one; three to six works best. They come first on your listing.</p>
          <Photos photos={photos} setPhotos={setPhotos} onProblem={setProblem} />
        </>
      )}

      {step === "pin" && (
        <>
          <p className="text-body-lg text-ink-muted">Customers see your pin on the map and get directions to it.</p>
          <Pin lat={p.lat} lng={p.lng} approx={p.approx} area={p.area} onProblem={setProblem} />
        </>
      )}

      {step === "extras" && (
        <>
          <p className="text-body-lg text-ink-muted">Tap everything that&apos;s true. It shows on your listing. You can skip this.</p>
          <Extras
            amenities={amenities}
            languages={languages}
            onChange={(a, l) => {
              setAmenities(a);
              setLanguages(l);
            }}
          />
        </>
      )}

      {step === "check" && (
        <>
          {shownMissing.length > 0 ? (
            <section className="rounded-card border border-line bg-surface-raised p-4">
              <h3 className="text-title mb-2">Before you&apos;re listed</h3>
              <ul className="grid gap-2">
                {shownMissing.map((m) => (
                  <li key={m} className="text-body flex items-start gap-2.5">
                    <X size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                    {m === "priced_service" ? (
                      <Link href="/app/page" className="underline">
                        {MISSING_TEXT[m]}
                      </Link>
                    ) : (
                      <button type="button" className="text-left underline" onClick={() => go("photos")}>
                        {MISSING_TEXT[m]}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-body-lg text-ink-muted">Everything&apos;s ready. Have a look at your listing, then list yourself. You can leave Tikka&apos;s search any time.</p>
          )}
          <a href={`/book/${p.slug}`} target="_blank" rel="noopener" className="btn btn-secondary btn-lg rounded-pill">
            <ExternalLink aria-hidden="true" /> See how your listing looks
          </a>
        </>
      )}

      <Problem text={problem} />

      <button type="button" disabled={!ready[step] || pending} onClick={step === "check" ? list : next} className="btn btn-lg w-full rounded-pill">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {step === "check" ? "List me on Tikka" : step === "extras" ? "Save and continue" : "Continue"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ listed: settings */

function Listed(p: Props) {
  const [listed, setListed] = useState(p.listed);
  const [photos, setPhotos] = useState(p.photos);
  const [amenities, setAmenities] = useState(p.amenities);
  const [languages, setLanguages] = useState(p.languages);
  const [extrasSaved, setExtrasSaved] = useState(true);
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();

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
  function saveExtras() {
    start(async () => {
      const r = await saveListingExtrasAction(amenities, languages);
      if (r.ok) setExtrasSaved(true);
      else setProblem("That didn't save. Try again.");
    });
  }

  return (
    <div className="grid gap-4">
      <button type="button" aria-pressed={listed} disabled={pending} onClick={toggle} className="flex min-h-18 items-center gap-4 rounded-card border border-line bg-surface-raised px-4 py-4 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[17px]">Show me in Tikka&apos;s search</b>
          <span className="text-caption text-ink-muted">{listed ? `Listed since ${day(p.termsAt!)}. Customers find you by service, place and time.` : "Hidden from search. Your own page still works."}</span>
        </span>
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-pill p-0.5 transition-colors ${listed ? "bg-success" : "bg-line-strong"}`} aria-hidden="true">
          <span className={`size-6 rounded-pill bg-white shadow transition-transform ${listed ? "translate-x-5" : ""}`} />
        </span>
      </button>

      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="text-title">Photos of your space</h2>
        <p className="text-caption mt-1 mb-3 text-ink-muted">Up to 6. They come first on your listing, then your work.</p>
        <Photos photos={photos} setPhotos={setPhotos} onProblem={setProblem} />
      </section>

      {!p.goesToCustomers && (
        <section className="rounded-card border border-line bg-surface-raised p-4">
          <h2 className="text-title mb-1 flex items-center gap-2">
            <MapPin size={20} aria-hidden="true" /> Where&apos;s your shop?
          </h2>
          <Pin lat={p.lat} lng={p.lng} approx={p.approx} area={p.area} onProblem={setProblem} />
        </section>
      )}

      <section className="rounded-card border border-line bg-surface-raised p-4">
        <h2 className="text-title mb-3">What customers like to know</h2>
        <Extras
          amenities={amenities}
          languages={languages}
          onChange={(a, l) => {
            setAmenities(a);
            setLanguages(l);
            setExtrasSaved(false);
          }}
        />
        <button type="button" onClick={saveExtras} disabled={extrasSaved || pending} className="btn btn-lg mt-4 w-full rounded-pill">
          <Check aria-hidden="true" /> {extrasSaved ? "Saved" : "Save"}
        </button>
      </section>

      <details className="rounded-card border border-line bg-surface-raised px-4">
        <summary className="text-body flex min-h-14 cursor-pointer list-none items-center justify-between font-semibold">Your listing terms</summary>
        <div className="pb-4">
          <Terms />
          <p className="text-caption mt-3 text-ink-muted">You agreed on {day(p.termsAt!)}.</p>
        </div>
      </details>

      <Problem text={problem} />

      <a href={`/book/${p.slug}`} target="_blank" rel="noopener" className="btn btn-secondary btn-lg rounded-pill">
        <ExternalLink aria-hidden="true" /> See your listing
      </a>
    </div>
  );
}
