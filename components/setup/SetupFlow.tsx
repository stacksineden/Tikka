"use client";

import { ArrowLeft, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveCard } from "@/app/app/actions";
import type { CardFace } from "@/components/tikka/TikkaCard";
import { checkBrandColor, normalizeHex, SWATCHES } from "@/lib/color";
import { initialsFrom, NAME_HINT, nameMax, suggestPrefix, validateCard, type CardDraft, type Errors } from "@/lib/setup";
import { suggestSlug } from "@/lib/slug";
import { CardPreview } from "./CardPreview";
import { ClaimPreview, FullPreviewButton, type PreviewBusiness } from "./ClaimPreview";
import { ServicesField } from "./ExtrasFields";
import { ActionsField, BackgroundField, CategorySelect, ColorField, LocationFields, LogoField, PrefixField, SlugField, TextInput } from "./Fields";

const STEPS = [
  { title: "Your business", body: "What people see first on your card.", keys: ["name", "tagline", "category", "state", "city"] },
  { title: "Your look", body: "Make it unmistakably yours.", keys: ["logo", "brandColor", "background"] },
  { title: "How people reach you", body: "The buttons on your card, your free page address, and your code letters.", keys: ["actions", "action-", "services", "service-", "slug", "codePrefix"] },
];

function stepOf(key: string) {
  return STEPS.findIndex((s) => s.keys.some((k) => (k.endsWith("-") ? key.startsWith(k) : key === k)));
}

export function draftToFace(d: CardDraft): CardFace {
  const hex = normalizeHex(d.brandColor) ?? SWATCHES[0].hex;
  return {
    name: d.name.trim() || "Your business",
    initials: initialsFrom(d.name) || "YB",
    category: d.category || "Your category",
    area: d.area,
    city: d.city || "Your city",
    brandColor: hex,
    onBrandColor: checkBrandColor(hex).on,
    logoUrl: d.logoUrl,
    background: d.background,
    tagline: d.tagline,
  };
}

export function SetupFlow({ initial }: { initial: CardDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [prefixTouched, setPrefixTouched] = useState(!!initial.codePrefix);
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [saving, startSaving] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);
  const face = useMemo(() => draftToFace(draft), [draft]);
  const previewBusiness: PreviewBusiness = {
    name: face.name,
    area: draft.area,
    city: face.city,
    actions: draft.actions,
    services: (draft.services ?? []).filter((s) => s.name.trim()),
    reviewCount: 0,
    hasVideo: false,
  };
  const last = step === STEPS.length - 1;

  function patch(p: Partial<CardDraft>) {
    setDraft((d) => {
      const next = { ...d, ...p };
      if (p.name !== undefined && !prefixTouched) next.codePrefix = suggestPrefix(p.name);
      if (p.name !== undefined && !slugTouched) next.slug = suggestSlug(p.name);
      return next;
    });
    // Clear errors for the fields being edited.
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k === "logoUrl" ? "logo" : k];
      if (p.actions || p.services) for (const k of Object.keys(n)) if (k.startsWith("action") || k.startsWith("service")) delete n[k];
      return n;
    });
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (el?.matches("input, select, textarea")) el.focus({ preventScroll: true });
    });
  }

  function goTo(n: number) {
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  function next() {
    const r = validateCard(draft, initial.name);
    const stepErrors = r.ok ? {} : Object.fromEntries(Object.entries(r.errors).filter(([k]) => stepOf(k) === step));
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      focusFirstError();
      return;
    }
    if (!last) return goTo(step + 1);

    startSaving(async () => {
      const res = await saveCard(draft);
      if (res.ok) {
        router.push("/app/setup/live");
        router.refresh();
        return;
      }
      setErrors(res.errors);
      const first = Math.min(...Object.keys(res.errors).map(stepOf).filter((i) => i >= 0), step);
      if (first !== step) goTo(first);
      focusFirstError();
    });
  }

  const { title, body } = STEPS[step];

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4">
          {step > 0 ? (
            <button type="button" onClick={() => goTo(step - 1)} className="grid size-11 place-items-center rounded-md text-ink" aria-label="Back">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <Link href="/app" className="grid size-11 place-items-center rounded-md text-ink" aria-label="Close card setup">
              <X size={20} aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-label">Set up your card</div>
            <div className="text-caption text-ink-muted">
              Step {step + 1} of {STEPS.length} · about 3 minutes
            </div>
          </div>
        </div>
        <div className="h-1 bg-surface-sunken" aria-hidden="true">
          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 lg:grid-cols-[1fr_380px] lg:gap-10 lg:px-4 lg:py-8">
        {/* phones: the card sits above the form */}
        <div className="lg:hidden">
          <CardPreview face={face} prefix={draft.codePrefix} compact />
          <div className="stage -mt-px bg-night px-4 pb-4 text-center">
            <FullPreviewButton face={face} business={previewBusiness} prefix={draft.codePrefix} className="w-full" />
          </div>
        </div>

        <main ref={formRef} className="px-4 pb-32 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
          <h1 className="text-heading">{title}</h1>
          <p className="text-body mt-1 text-ink-muted">{body}</p>

          <div className="mt-6 grid gap-6">
            {step === 0 && (
              <>
                <TextInput
                  label="Brand name"
                  value={draft.name}
                  onChange={(v) => patch({ name: v })}
                  error={errors.name}
                  max={nameMax(initial.name)}
                  autoComplete="organization"
                  hint={NAME_HINT}
                  placeholder="e.g. Glow Studio"
                />
                <TextInput
                  label="Tagline (optional)"
                  value={draft.tagline ?? ""}
                  onChange={(v) => patch({ tagline: v })}
                  error={errors.tagline}
                  max={60}
                  hint="One line under your name on the card."
                  placeholder="e.g. Facials, peels and glow-ups since 2019."
                />
                <CategorySelect value={draft.category} onChange={(v) => patch({ category: v })} error={errors.category} />
                <LocationFields
                  state={draft.state}
                  city={draft.city}
                  area={draft.area}
                  onChange={(p) => patch(p)}
                  errors={errors}
                />
              </>
            )}
            {step === 1 && (
              <>
                <LogoField
                  value={draft.logoUrl}
                  initials={face.initials}
                  brandColor={face.brandColor}
                  onChange={(v) => patch({ logoUrl: v })}
                  error={errors.logo}
                />
                <ColorField value={draft.brandColor} onChange={(v) => patch({ brandColor: v })} error={errors.brandColor} />
                <BackgroundField
                  value={draft.background}
                  brandColor={face.brandColor}
                  onChange={(v) => patch({ background: v })}
                  error={errors.background}
                />
              </>
            )}
            {step === 2 && (
              <>
                <ActionsField
                  value={draft.actions}
                  onChange={(v) => patch({ actions: v })}
                  errors={errors}
                  servicesSlot={<ServicesField value={draft.services ?? []} onChange={(v) => patch({ services: v })} errors={errors} />}
                />
                <SlugField
                  value={draft.slug ?? ""}
                  city={draft.city}
                  onChange={(v) => {
                    setSlugTouched(true);
                    patch({ slug: v });
                  }}
                  error={errors.slug}
                />
                <PrefixField
                  value={draft.codePrefix}
                  name={draft.name}
                  onChange={(v) => {
                    setPrefixTouched(true);
                    patch({ codePrefix: v });
                  }}
                  error={errors.codePrefix}
                />
              </>
            )}
            {errors.form && (
              <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
                {errors.form}
              </p>
            )}
          </div>
        </main>

        {/* desktop: the card stays in view beside the form */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <ClaimPreview face={face} business={previewBusiness} prefix={draft.codePrefix} />
          </div>
        </aside>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:static lg:border-0 lg:bg-transparent lg:pb-10 lg:pt-0">
        <div className="mx-auto flex max-w-5xl gap-3 lg:pr-[420px]">
          <button type="button" onClick={next} disabled={saving} className="btn btn-lg w-full lg:w-auto lg:min-w-48">
            {saving && <Loader2 className="animate-spin" />}
            {last ? (saving ? "Saving your card…" : "Save my card") : "Continue"}
          </button>
        </div>
      </footer>
    </div>
  );
}
