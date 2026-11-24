"use client";

/* eslint-disable @next/next/no-img-element -- small portfolio thumbnails, already 400px WebP. */
import { Check, ChevronLeft, Printer, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { removeContactCardAction, saveContactCardAction } from "@/app/app/contact-card-actions";
import { CardFace, type CardBusiness, type CardSettings } from "@/components/contact-cards/CardFace";
import { FitCard } from "@/components/contact-cards/FitCard";
import {
  availableStyles,
  cardInstagram,
  cardPhone,
  cardPhoto,
  cardStyle,
  CONTACT_STYLES,
  PERSON_MAX,
  photoChoices,
  validatePerson,
  type ContactCard,
  type ContactCardStyle,
} from "@/lib/contact-cards";
import type { TeamMember } from "@/lib/types";

// The business card editor (docs/BUSINESS_CARDS.md): one choice per step (Card style → Photo →
// Whose card → check and save), with the real card above, front or back as the step needs.

type Step = "style" | "photo" | "who" | "finish";

interface Props {
  b: CardBusiness;
  card: ContactCard;
  qr: string;
  bookingsOn: boolean;
  team: TeamMember[];
  canRemove: boolean;
}

export function CardEditor({ b, card, qr, bookingsOn, team, canRemove }: Props) {
  const photos = photoChoices(b);
  const styles = availableStyles(b);
  const [style, setStyle] = useState<ContactCardStyle>(cardStyle(card, b));
  const [photoId, setPhotoId] = useState<string | undefined>(cardPhoto(card, b)?.id);
  const [personName, setPersonName] = useState(card.personName ?? "");
  const [personRole, setPersonRole] = useState(card.personRole ?? "");
  const [who, setWho] = useState<string>(() => {
    if (!card.personName) return "business";
    const m = team.find((t) => t.name === card.personName);
    return m ? `team:${m.id}` : "other";
  });
  const [rounded, setRounded] = useState(card.rounded);
  const [showPhone, setShowPhone] = useState(card.showPhone);
  const [showInstagram, setShowInstagram] = useState(card.showInstagram);
  const [showPlace, setShowPlace] = useState(card.showPlace);

  const steps: Step[] = ["style", ...(style === "photo" && photos.length > 1 ? (["photo"] as Step[]) : []), "who", "finish"];
  const [step, setStep] = useState<Step>("style");
  const at = Math.max(0, steps.indexOf(step));
  const [side, setSide] = useState<"front" | "back">("front");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const settings: CardSettings = { style, photoId, personName: personName.trim() || undefined, personRole: personRole.trim() || undefined, rounded, showPhone, showInstagram, showPlace };
  const go = (next: Step) => {
    setStep(next);
    setSide(next === "who" ? "back" : "front");
    setError(null);
    setSaved(false);
  };

  const pickWho = (value: string) => {
    setWho(value);
    if (value === "business") {
      setPersonName("");
      setPersonRole("");
    } else if (value.startsWith("team:")) {
      const m = team.find((t) => `team:${t.id}` === value);
      setPersonName(m?.name ?? "");
      setPersonRole(m?.role ?? "");
    }
  };

  const save = () => {
    const problem = validatePerson(personName, personRole);
    if (problem) {
      setError(problem);
      return;
    }
    start(async () => {
      const r = await saveContactCardAction(card.id, {
        style,
        photoId: style === "photo" ? photoId : card.photoId,
        personName,
        personRole,
        rounded,
        showPhone,
        showInstagram,
        showPlace,
      });
      if (r.error) setError(r.error);
      else setSaved(true);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      {/* The real card, front or back. Sticky on desktop so it stays in view. */}
      <div className="grid gap-2 lg:sticky lg:top-6">
        {step === "finish" ? (
          <div className="grid gap-3">
            <FitCard>
              <CardFace b={b} card={settings} side="front" bookingsOn={bookingsOn} />
            </FitCard>
            <FitCard>
              <CardFace b={b} card={settings} side="back" qr={qr} bookingsOn={bookingsOn} />
            </FitCard>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setSide(side === "front" ? "back" : "front")} className="block w-full rounded-md text-left" aria-label={side === "front" ? "Show the back" : "Show the front"}>
              <FitCard>
                <CardFace b={b} card={settings} side={side} qr={qr} bookingsOn={bookingsOn} />
              </FitCard>
            </button>
            <button type="button" onClick={() => setSide(side === "front" ? "back" : "front")} className="btn btn-ghost min-h-11 justify-self-center px-4 text-label">
              <RotateCcw />
              {side === "front" ? "Show the back" : "Show the front"}
            </button>
          </>
        )}
      </div>

      <div className="grid gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-6">
        <p className="text-caption font-semibold text-ink-muted">
          Step {at + 1} of {steps.length}
        </p>

        {step === "style" && (
          <fieldset className="grid gap-3">
            <legend className="text-title mb-3">Card style</legend>
            <div className="grid grid-cols-2 gap-3">
              {CONTACT_STYLES.filter((s) => styles.includes(s.id)).map((s) => (
                <label key={s.id} className={`grid cursor-pointer gap-2 rounded-md border p-2 ${style === s.id ? "border-brand ring-1 ring-brand" : "border-line"}`}>
                  <input type="radio" name="style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} className="sr-only" />
                  <FitCard>
                    <CardFace b={b} card={{ ...settings, style: s.id }} side="front" bookingsOn={bookingsOn} />
                  </FitCard>
                  <span className="text-label flex items-center gap-1">
                    {style === s.id && <Check size={16} className="text-brand" aria-hidden="true" />}
                    {s.label}
                  </span>
                  <span className="text-caption text-ink-muted">{s.about}</span>
                </label>
              ))}
            </div>
            {!styles.includes("photo") && <p className="text-caption text-ink-muted">Add photos to your page to put one on your card.</p>}
          </fieldset>
        )}

        {step === "photo" && (
          <fieldset className="grid gap-3">
            <legend className="text-title mb-1">Pick a photo</legend>
            <p className="text-caption text-ink-muted">From your page. Photos with space at the bottom fit the name best.</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <label key={p.id} className={`relative cursor-pointer overflow-hidden rounded-md border-2 ${photoId === p.id ? "border-brand" : "border-transparent"}`}>
                  <input type="radio" name="photo" value={p.id} checked={photoId === p.id} onChange={() => setPhotoId(p.id)} className="sr-only" />
                  <img src={p.thumbUrl} alt={p.caption ?? ""} className="aspect-square w-full object-cover" />
                  {photoId === p.id && (
                    <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-pill bg-brand text-on-brand">
                      <Check size={14} aria-hidden="true" />
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === "who" && (
          <fieldset className="grid gap-2">
            <legend className="text-title mb-1">Whose card?</legend>
            <p className="text-caption mb-1 text-ink-muted">The back shows their name and role. The QR always opens your page.</p>
            {[{ value: "business", label: b.name, sub: "The business" }, ...team.map((m) => ({ value: `team:${m.id}`, label: m.name, sub: m.role ?? "On your team" })), { value: "other", label: "Someone else", sub: "Type their name" }].map((o) => (
              <label key={o.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 ${who === o.value ? "border-brand ring-1 ring-brand" : "border-line"}`}>
                <input type="radio" name="who" value={o.value} checked={who === o.value} onChange={() => pickWho(o.value)} className="size-5 accent-[var(--brand)]" />
                <span className="grid">
                  <span className="text-label">{o.label}</span>
                  <span className="text-caption text-ink-muted">{o.sub}</span>
                </span>
              </label>
            ))}
            {who === "other" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-caption font-semibold">Name</span>
                  <input value={personName} onChange={(e) => setPersonName(e.target.value)} maxLength={PERSON_MAX} className="input" placeholder="e.g. Ada Nwosu" />
                </label>
                <label className="grid gap-1">
                  <span className="text-caption font-semibold">Role (optional)</span>
                  <input value={personRole} onChange={(e) => setPersonRole(e.target.value)} maxLength={PERSON_MAX} className="input" placeholder="e.g. Lash artist" />
                </label>
              </div>
            )}
          </fieldset>
        )}

        {step === "finish" && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-title">Looks right?</h2>
              <p className="text-caption mt-1 text-ink-muted">The phone, Instagram and area come from your page. Change them there and your card follows.</p>
            </div>
            <details className="rounded-md border border-line">
              <summary className="text-label flex min-h-12 cursor-pointer items-center px-3">More options</summary>
              <div className="grid gap-1 px-3 pb-3">
                <Toggle label="Rounded corners" sub="Ask the printer for rounded corners too." checked={rounded} onChange={setRounded} />
                {cardPhone(b) && <Toggle label="Show the phone number" checked={showPhone} onChange={setShowPhone} />}
                {cardInstagram(b) && <Toggle label="Show Instagram" checked={showInstagram} onChange={setShowInstagram} />}
                <Toggle label="Show where you are" checked={showPlace} onChange={setShowPlace} />
              </div>
            </details>
            {saved && (
              <div className="grid gap-2">
                <p role="status" className="text-label flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-success">
                  <Check size={16} aria-hidden="true" />
                  Saved. Print it now or any time from Business cards.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/app/posters/cards/${card.id}/print?format=printer`} className="btn btn-secondary min-h-11 px-3 text-label">
                    <Printer />
                    For a printer
                  </Link>
                  <Link href={`/app/posters/cards/${card.id}/print?format=sheet`} className="btn btn-secondary min-h-11 px-3 text-label">
                    <Printer />
                    A4 sheet
                  </Link>
                </div>
              </div>
            )}
            {canRemove && (
              <div className="border-t border-line pt-3">
                {confirmRemove ? (
                  <div className="grid gap-2">
                    <p className="text-caption">Remove this card? Cards you&apos;ve already printed keep opening your page.</p>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary min-h-11 flex-1 px-3 text-label" onClick={() => setConfirmRemove(false)}>
                        Keep it
                      </button>
                      <button
                        type="button"
                        className="btn min-h-11 flex-1 bg-danger px-3 text-label text-on-danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await removeContactCardAction(card.id);
                            if (r?.error) setError(r.error);
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="text-caption min-h-11 font-semibold text-danger" onClick={() => setConfirmRemove(true)}>
                    Remove this card
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-caption font-semibold text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {at > 0 ? (
            <button type="button" className="btn btn-secondary min-h-12 px-4" onClick={() => go(steps[at - 1])}>
              <ChevronLeft />
              Back
            </button>
          ) : (
            <Link href="/app/posters/cards" className="btn btn-secondary min-h-12 px-4">
              <ChevronLeft />
              Cards
            </Link>
          )}
          {step === "finish" ? (
            <button type="button" className="btn btn-lg min-h-12 flex-1" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save card"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-lg min-h-12 flex-1"
              onClick={() => {
                if (step === "who") {
                  const problem = who === "other" && !personName.trim() ? "Add their name." : validatePerson(personName, personRole);
                  if (problem) return setError(problem);
                }
                go(steps[at + 1]);
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="grid">
        <span className="text-body">{label}</span>
        {sub && <span className="text-caption text-ink-muted">{sub}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--brand)]" />
    </label>
  );
}
