"use client";

import { Check, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveCard, type Extras } from "@/app/app/actions";
import { NAME_HINT, nameMax, type CardDraft, type Errors } from "@/lib/setup";
import type { Business } from "@/lib/types";
import { CardPreview } from "./CardPreview";
import { ClaimPreview, FullPreviewButton, type PreviewBusiness } from "./ClaimPreview";
import { HoursField, VideoField } from "./ExtrasFields";
import { ActionsField, BackgroundField, CategorySelect, ColorField, LocationFields, LogoField, PrefixField, SlugField, TextInput } from "./Fields";
import { draftToFace } from "./SetupFlow";
import { VIDEO_UPLOADS } from "@/lib/features";

type Draft = CardDraft & Extras;

function toDraft(b: Business): Draft {
  return {
    name: b.name,
    category: b.category,
    state: b.state,
    city: b.city,
    area: b.area,
    brandColor: b.brandColor,
    logoUrl: b.logoUrl,
    background: b.background,
    actions: b.actions,
    codePrefix: b.codePrefix,
    tagline: b.tagline ?? "",
    about: b.about ?? "",
    hours: b.hours,
    services: b.services,
    hasVideo: b.hasVideo,
    videoUrl: b.videoUrl,
    videoPosterUrl: b.videoPosterUrl,
    slug: b.slug,
    address: b.address ?? "",
  };
}

function previewOf(d: Draft, b: Business): PreviewBusiness {
  return {
    name: d.name || b.name,
    about: d.about,
    hours: d.hours,
    area: d.area,
    city: d.city,
    actions: d.actions,
    services: (d.services ?? []).filter((s) => s.name.trim()),
    rating: b.rating,
    reviewCount: b.reviewCount,
    hasVideo: !!d.hasVideo,
    videoPosterUrl: d.videoPosterUrl,
  };
}

const SAMPLE_REVIEWS = [
  { name: "Kemi B.", rating: 5, text: "Came in for the 20% off and booked again the same week." },
  { name: "Tunde A.", rating: 5, text: "Quick, clean, and they remembered my name the second time." },
];

function useEditor(business: Business, root: React.RefObject<HTMLDivElement | null>) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => toDraft(business));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [justSaved, setJustSaved] = useState(false);
  const [saving, start] = useTransition();
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  function patch(p: Partial<Draft>) {
    setJustSaved(false);
    setDraft((d) => ({ ...d, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k === "logoUrl" ? "logo" : k];
      for (const k of Object.keys(n)) {
        if ((p.actions && k.startsWith("action")) || (p.services && (k.startsWith("service") || k.startsWith("action"))) || (p.hours && k.startsWith("hours"))) delete n[k];
      }
      return n;
    });
  }

  function save() {
    start(async () => {
      const res = await saveCard(draft);
      if (res.ok) {
        setSaved(draft);
        setJustSaved(true);
        router.refresh();
      } else {
        setErrors(res.errors);
        requestAnimationFrame(() => {
          root.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }
    });
  }

  return { draft, patch, errors, dirty, saving, save, justSaved, reset: () => setDraft(saved) };
}

const LOOK_KEYS = ["logo", "brandColor", "background"];

/** An error for a field that isn't on this page (e.g. a missing logo while editing the profile). */
function offPageProblem(errors: Errors, onLookPage: boolean): { message: string; href: string; cta: string } | null {
  const key = Object.keys(errors).find((k) => LOOK_KEYS.includes(k) !== onLookPage);
  if (!key) return null;
  return onLookPage
    ? { message: errors[key]!, href: "/app/settings/profile", cta: "Fix in Business profile" }
    : { message: errors[key]!, href: "/app/settings/card", cta: "Fix in Card look" };
}

function SaveBar({
  dirty,
  saving,
  justSaved,
  onSave,
  onReset,
  problem,
}: {
  dirty: boolean;
  saving: boolean;
  justSaved: boolean;
  onSave: () => void;
  onReset: () => void;
  problem: ReturnType<typeof offPageProblem>;
}) {
  if (!dirty && !justSaved) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface-raised px-4 py-3 shadow-raised lg:bottom-0 lg:left-[248px]">
      {problem && (
        <p role="alert" className="text-label mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-x-2 rounded-md bg-danger-soft px-3 py-2 text-danger">
          Couldn&apos;t save: {problem.message}
          <Link href={problem.href} className="underline">
            {problem.cta}
          </Link>
        </p>
      )}
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {dirty ? (
          <>
            <span className="text-label hidden flex-1 text-ink-muted sm:block">You have unsaved changes</span>
            <button type="button" className="btn btn-ghost" onClick={onReset} disabled={saving}>
              Discard
            </button>
            <button type="button" className="btn flex-1 sm:flex-none sm:min-w-40" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <p className="text-label flex items-center gap-2 text-success" role="status">
            <Check size={16} strokeWidth={3} aria-hidden="true" />
            Saved. Your card is up to date.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-card border border-line bg-surface-raised p-4 sm:p-6">
      <h2 className="text-title text-[17px] leading-6">{title}</h2>
      <div className="mt-4 grid gap-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ card look */

export function CardLookEditor({ business }: { business: Business }) {
  const root = useRef<HTMLDivElement>(null);
  const e = useEditor(business, root);
  const face = draftToFace(e.draft);
  return (
    <div ref={root} className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="-mx-4 lg:hidden">
        <CardPreview face={face} prefix={e.draft.codePrefix} compact />
        <div className="stage -mt-px bg-night px-4 pb-4">
          <FullPreviewButton face={face} business={previewOf(e.draft, business)} prefix={e.draft.codePrefix} reviews={business.reviewCount ? SAMPLE_REVIEWS : []} className="w-full" />
        </div>
      </div>
      <div className="grid gap-4">
        <Section title="Logo">
          <LogoField value={e.draft.logoUrl} initials={face.initials} brandColor={face.brandColor} onChange={(v) => e.patch({ logoUrl: v })} error={e.errors.logo} />
        </Section>
        <Section title="Colour and background">
          <ColorField value={e.draft.brandColor} onChange={(v) => e.patch({ brandColor: v })} error={e.errors.brandColor} />
          <BackgroundField value={e.draft.background} brandColor={face.brandColor} onChange={(v) => e.patch({ background: v })} error={e.errors.background} />
        </Section>
        <nav aria-label="More on your card" className="rounded-card border border-line bg-surface-raised p-4 sm:p-6">
          <h2 className="text-title text-[17px] leading-6">More on your card</h2>
          <ul className="mt-2 divide-y divide-line">
            {[
              ["/app/settings/profile#buttons", "Buttons and contact", "WhatsApp, call, address, booking link, social pages"],
              ["/app/settings/profile#services", "Services and prices", `${(e.draft.services ?? []).length} listed`],
              ["/app/settings/profile#basics", "Name, tagline and location", e.draft.name],
              ["/app/settings/profile#about", "About and opening hours", e.draft.about ? "Added" : "Not added yet"],
            ].map(([href, label, meta]) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-body block font-semibold">{label}</span>
                    <span className="text-caption block truncate text-ink-muted">{meta}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <aside className="sticky top-8 hidden lg:block">
        <ClaimPreview face={face} business={previewOf(e.draft, business)} prefix={e.draft.codePrefix} reviews={business.reviewCount ? SAMPLE_REVIEWS : []} />
      </aside>
      <SaveBar dirty={e.dirty} saving={e.saving} justSaved={e.justSaved} onSave={e.save} onReset={e.reset} problem={offPageProblem(e.errors, true)} />
    </div>
  );
}

/* ------------------------------------------------------- business profile */

export function ProfileEditor({ business }: { business: Business }) {
  const root = useRef<HTMLDivElement>(null);
  const e = useEditor(business, root);
  const { draft, patch, errors } = e;
  return (
    <div ref={root} className="grid gap-4">
      <FullPreviewButton
        face={draftToFace(draft)}
        business={previewOf(draft, business)}
        prefix={draft.codePrefix}
        reviews={business.reviewCount ? SAMPLE_REVIEWS : []}
        className="justify-self-start"
      />

      <nav aria-label="Jump to" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {[
          ["#basics", "Name and location"],
          ["#buttons", "Buttons and contact"],
          ["#services", "Services"],
          ["#about", "About and hours"],
          ["#photos", "Photos"],
          ["#video", "Video"],
          ["#codes", "Page address"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-label inline-flex min-h-10 shrink-0 items-center rounded-pill border border-line bg-surface-raised px-3.5 text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Section id="basics" title="Name and location">
        <TextInput label="Brand name" value={draft.name} onChange={(v) => patch({ name: v })} error={errors.name} max={nameMax(business.name)} hint={NAME_HINT} autoComplete="organization" />
        <div id="tagline" className="scroll-mt-20">
          <TextInput
            label="Tagline (optional)"
            value={draft.tagline ?? ""}
            onChange={(v) => patch({ tagline: v })}
            error={errors.tagline}
            max={60}
            hint="One line under your name on the card."
            placeholder="e.g. Facials, peels and glow-ups since 2019."
          />
        </div>
        <CategorySelect value={draft.category} onChange={(v) => patch({ category: v })} error={errors.category} />
        <LocationFields state={draft.state} city={draft.city} area={draft.area} onChange={(p) => patch(p)} errors={errors} />
        <TextInput
          label="Street address (optional)"
          value={draft.address ?? ""}
          onChange={(v) => patch({ address: v })}
          error={errors.address}
          max={120}
          autoComplete="street-address"
          placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
          hint="Shown on your business page with an Open in Maps link."
        />
      </Section>

      <Section id="buttons" title="Buttons and contact">
        <p className="text-body -mt-2 text-ink-muted">
          Your WhatsApp and phone number, address for directions, booking link, the Services button, and your Instagram, TikTok, Facebook, X or YouTube.
        </p>
        <ActionsField
          value={draft.actions}
          onChange={(v) => patch({ actions: v })}
          errors={errors}
          servicesSlot={
            <Link href="/app/page" className="text-label inline-flex min-h-11 items-center text-brand">
              {(draft.services ?? []).filter((s) => s.name.trim()).length || "No"} services listed · Edit in Your page
            </Link>
          }
        />
      </Section>

      <Section id="about" title="Opening hours">
        <HoursField value={draft.hours} onChange={(v) => patch({ hours: v })} errors={errors} />
      </Section>

      <Section id="services" title="Services, about and photos">
        {/* One place to edit them: Your page (PRD A5). */}
        <p className="text-body text-ink-muted">Your services and prices, your about, and your portfolio are edited in Your page, where you can see them as people will.</p>
        <Link href="/app/page" className="btn btn-secondary justify-self-start">
          Open Your page
        </Link>
      </Section>

      {/* Videos can be switched off per deployment; one already added can still be removed. */}
      {(VIDEO_UPLOADS || draft.hasVideo) && (
        <Section id="video" title="Video">
          <VideoField hasVideo={!!draft.hasVideo} posterUrl={draft.videoPosterUrl} onChange={(v) => patch(v)} />
        </Section>
      )}

      <Section id="codes" title="Page address and code letters">
        <SlugField value={draft.slug ?? ""} city={draft.city} onChange={(v) => patch({ slug: v })} error={errors.slug} />
        <PrefixField value={draft.codePrefix} name={draft.name} onChange={(v) => patch({ codePrefix: v })} error={errors.codePrefix} />
        <p className="text-caption -mt-3 text-ink-muted">Changing them only affects new codes. Codes already given out keep working.</p>
      </Section>

      <SaveBar dirty={e.dirty} saving={e.saving} justSaved={e.justSaved} onSave={e.save} onReset={e.reset} problem={offPageProblem(e.errors, false)} />
    </div>
  );
}
