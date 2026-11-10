"use client";

import { Check, ChevronDown, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { savePageAction, saveServicesAction } from "@/app/app/actions";
import { PortfolioEditor } from "@/components/setup/PortfolioEditor";
import { prepareAbout, prepareCropped, prepareHero, prepareService, uploadPhoto, type MediaKind } from "@/lib/media-client";
import { focalPosition, heroHeadline, heroLine, PAGE_LIMITS, priceText } from "@/lib/page";
import type { Business, BusinessPage, FaqItem, ServeMode, ServiceItem, TeamMember } from "@/lib/types";

type Errors = Record<string, string | undefined>;

const tmpId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------ shared bits */

function Card({ title, status, children, open = false }: { title: string; status: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-card border border-line bg-surface-raised">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="text-title block text-[17px] leading-6">{title}</span>
          <span className="text-caption block text-ink-muted">{status}</span>
        </span>
        <ChevronDown size={20} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-4 border-t border-line p-4 sm:p-5">{children}</div>
    </details>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-label">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-caption font-semibold text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-caption text-ink-muted">{hint}</span>
      )}
    </label>
  );
}

function Toggle({ on, onChange, label, note }: { on: boolean; onChange: (v: boolean) => void; label: string; note: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="text-body block font-semibold">{label}</span>
        <span className="text-caption block text-ink-muted">{note}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className="relative h-7 w-12 shrink-0 rounded-pill bg-line-strong/50 transition-colors peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:size-5 after:rounded-pill after:bg-surface-raised after:transition-transform peer-checked:after:translate-x-5"
        aria-hidden="true"
      />
    </label>
  );
}

/** One save button per section, with "Saved" and the server's error. */
function useSave() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; errors: Errors }>) =>
    start(async () => {
      setSaved(false);
      const r = await fn();
      if (r.ok) {
        setErrors({});
        setSaved(true);
        setUnsaved(false);
      } else setErrors(r.errors);
    });
  return { pending, errors, saved, unsaved, run, dirty: () => (setSaved(false), setUnsaved(true)) };
}

function SaveRow({ s, label = "Save" }: { s: ReturnType<typeof useSave>; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn min-h-11 px-5" disabled={s.pending}>
        {s.pending && <Loader2 className="animate-spin" />}
        {label}
      </button>
      {s.saved && !s.pending && (
        <span className="text-label flex items-center gap-1 text-success" role="status">
          <Check size={16} aria-hidden="true" /> Saved. It&apos;s live on your page.
        </span>
      )}
      {s.unsaved && !s.pending && !s.saved && <span className="text-label text-gold-text">Not live yet: tap {label} to publish your changes.</span>}
      {s.errors.form && (
        <span role="alert" className="text-caption font-semibold text-danger">
          {s.errors.form}
        </span>
      )}
    </div>
  );
}

/** Pick a photo, compress it in the browser, hand back a data URL. */
function PhotoPick({
  label,
  kind,
  onPick,
  prepare,
  busyLabel = "Uploading…",
}: {
  label: string;
  kind: MediaKind;
  onPick: (url: string) => void;
  prepare: (f: File) => Promise<string>;
  busyLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  return (
    <span className="grid gap-1">
      <button type="button" className="btn btn-secondary min-h-11 justify-self-start px-4 text-label" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {busy ? busyLabel : label}
      </button>
      {problem && (
        <span role="alert" className="text-caption font-semibold text-danger">
          {problem}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setProblem(undefined);
          try {
            // Compressed here, uploaded to storage, and only the link is saved.
            onPick(await uploadPhoto(await prepare(f), kind));
          } catch (err) {
            setProblem((err as Error).message);
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </span>
  );
}

/* ---------------------------------------------------------------- hero */

function HeroCard({ b }: { b: Business }) {
  const s = useSave();
  const [img, setImg] = useState(b.page?.heroImageUrl);
  const [focal, setFocal] = useState(b.page?.heroFocal ?? { x: 0.5, y: 0.5 });
  const [headline, setHeadline] = useState(b.page?.headline ?? "");
  const [subline, setSubline] = useState(b.page?.subline ?? "");
  const suggested = { headline: heroHeadline({ ...b, page: {} }), line: heroLine({ ...b, page: {} }) };
  // A new or removed photo goes live straight away: an upload that waits for Save looks done but isn't.
  const setHero = (url: string | undefined) => {
    const centre = { x: 0.5, y: 0.5 };
    setImg(url);
    setFocal(centre);
    s.run(() => savePageAction({ heroImageUrl: url ?? "", heroFocal: centre }));
  };

  return (
    <Card title="Hero" status={img ? "Photo added" : "Add a photo of your space or your work"} open={!img}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          s.run(() => savePageAction({ heroImageUrl: img, heroFocal: focal, headline, subline }));
        }}
      >
        {img ? (
          <div className="grid gap-2">
            <span className="text-label">Tap the part of the photo that matters most</span>
            {/* The whole photo: tapping sets the focal point phones crop around. */}
            <button
              type="button"
              className="relative overflow-hidden rounded-md"
              aria-label="Set the focus point"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const next = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
                setFocal(next);
                s.run(() => savePageAction({ heroImageUrl: img, heroFocal: next }));
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="Your hero photo" className="block w-full" />
              <span
                className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-pill border-[3px] border-surface-raised shadow-raised"
                style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
                aria-hidden="true"
              />
            </button>
            <div className="flex items-end gap-3">
              <div className="grid gap-1">
                <span className="text-caption text-ink-muted">On phones</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-36 w-20 rounded-sm object-cover" style={{ objectPosition: focalPosition(focal) }} />
              </div>
              <div className="grid gap-1">
                <span className="text-caption text-ink-muted">On computers</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-20 w-36 rounded-sm object-cover" style={{ objectPosition: focalPosition(focal) }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <PhotoPick label="Change photo" kind="hero" prepare={prepareHero} onPick={(u) => setHero(u)} />
              <button type="button" className="btn btn-ghost min-h-11 px-3 text-label text-danger" onClick={() => setHero(undefined)}>
                <Trash2 /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-body text-ink-muted">A wide, bright photo of your space or your best work. Your brand colour shows until you add one.</p>
            <PhotoPick label="Add a hero photo" kind="hero" prepare={prepareHero} onPick={(u) => setHero(u)} />
          </div>
        )}
        <Field label="Headline" hint={`Leave empty to use: "${suggested.headline}"`} error={s.errors.headline}>
          <input className="input" value={headline} maxLength={PAGE_LIMITS.headline} placeholder={suggested.headline} onChange={(e) => (setHeadline(e.target.value), s.dirty())} />
        </Field>
        <Field label="Short line under it" hint={`Leave empty to use: "${suggested.line}"`} error={s.errors.subline}>
          <input className="input" value={subline} maxLength={PAGE_LIMITS.subline} placeholder={suggested.line} onChange={(e) => (setSubline(e.target.value), s.dirty())} />
        </Field>
        <SaveRow s={s} />
      </form>
    </Card>
  );
}

/* ----------------------------------------------------- how they use it */

const MODES: { id: ServeMode; label: string; note: string }[] = [
  { id: "in_store", label: "They come to us", note: "Your page shows your hours, address and Directions." },
  { id: "online", label: "Online, anywhere in Nigeria", note: "No address on your page. It says “Serves all of Nigeria”." },
  { id: "come_to_you", label: "We come to them", note: "No address on your page. It says “We come to you”." },
];

function ModeCard({ b }: { b: Business }) {
  const s = useSave();
  const [mode, setMode] = useState<ServeMode>(b.serveMode ?? "in_store");
  return (
    <Card title="How do customers use their Tikka?" status={MODES.find((m) => m.id === mode)!.label}>
      <div className="grid gap-2" role="radiogroup" aria-label="How do customers use their Tikka?">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => {
              setMode(m.id);
              s.run(() => savePageAction({ serveMode: m.id }));
            }}
            className={`rounded-md border p-3 text-left ${mode === m.id ? "border-brand bg-brand-soft" : "border-line"}`}
          >
            <span className="text-body block font-semibold">{m.label}</span>
            <span className="text-caption block text-ink-muted">{m.note}</span>
          </button>
        ))}
      </div>
      {s.saved && <span className="text-label flex items-center gap-1 text-success">
          <Check size={16} aria-hidden="true" /> Saved
        </span>}
    </Card>
  );
}

/* ---------------------------------------------------------------- about */

function AboutCard({ b }: { b: Business }) {
  const s = useSave();
  const [about, setAbout] = useState(b.about ?? "");
  const [img, setImg] = useState(b.page?.aboutImageUrl);
  return (
    <Card title="About" status={about.trim() ? "Added" : "Tell people who you are"}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          s.run(() => savePageAction({ about, aboutImageUrl: img }));
        }}
      >
        <Field label="Your story" hint={`${about.length} of ${PAGE_LIMITS.about}. What you do, since when, and what makes a visit good.`} error={s.errors.about}>
          <textarea className="input min-h-36 resize-y py-2.5 leading-6" value={about} maxLength={PAGE_LIMITS.about} onChange={(e) => (setAbout(e.target.value), s.dirty())} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="About photo" className="h-20 w-28 rounded-sm object-cover" />
          )}
          <PhotoPick label={img ? "Change photo" : "Add a photo (optional)"} kind="about" prepare={prepareAbout} onPick={(u) => (setImg(u), s.run(() => savePageAction({ aboutImageUrl: u })))} />
          {img && (
            <button type="button" className="btn btn-ghost min-h-11 px-3 text-label text-danger" onClick={() => (setImg(undefined), s.run(() => savePageAction({ aboutImageUrl: "" })))}>
              <Trash2 /> Remove
            </button>
          )}
        </div>
        <SaveRow s={s} />
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------- services */

function ServicesCard({ b }: { b: Business }) {
  const s = useSave();
  const [list, setList] = useState<ServiceItem[]>(() => b.services.map((x) => ({ ...x, id: x.id ?? tmpId("sv"), priceKind: x.priceKind ?? (x.price === null ? "ask" : "fixed") })));
  const [open, setOpen] = useState<string | null>(null);
  const groups = [...new Set(list.map((x) => x.group?.trim()).filter(Boolean))] as string[];
  const patch = (id: string, p: Partial<ServiceItem>) => (setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x))), s.dirty());

  return (
    <Card title="Services and prices" status={list.length ? `${list.length} of ${PAGE_LIMITS.services}` : "Add what you offer and what it costs"}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          s.run(() => saveServicesAction(list));
        }}
      >
        <p className="text-caption text-ink-muted">Each one gets a “Book on WhatsApp” button. Add a group (like Hair or Nails) to show them in tabs.</p>
        <datalist id="service-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <ul className="grid gap-2">
          {list.map((x, i) => {
            const isOpen = open === x.id;
            return (
              <li key={x.id} className="rounded-md border border-line">
                <button type="button" onClick={() => setOpen(isOpen ? null : x.id!)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left" aria-expanded={isOpen}>
                  {x.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.imageUrl} alt="" className="size-10 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <span className="size-10 shrink-0 rounded-sm" style={{ background: b.brandColor }} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-body block truncate font-semibold">{x.name || "New service"}</span>
                    <span className="text-caption block text-ink-muted">
                      {priceText(x)}
                      {x.group ? ` · ${x.group}` : ""}
                    </span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {s.errors[`service-${i}`] && (
                  <p role="alert" className="text-caption px-3 pb-2 font-semibold text-danger">
                    {s.errors[`service-${i}`]}
                  </p>
                )}
                {isOpen && (
                  <div className="grid gap-3 border-t border-line p-3">
                    <Field label="Name">
                      <input className="input" value={x.name} maxLength={PAGE_LIMITS.serviceName} placeholder="e.g. Knotless braids" onChange={(e) => patch(x.id!, { name: e.target.value })} />
                    </Field>
                    <div className="grid gap-1.5">
                      <span className="text-label">Price</span>
                      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup" aria-label="Price">
                        {(
                          [
                            ["fixed", "Price"],
                            ["from", "From"],
                            ["ask", "Ask"],
                          ] as const
                        ).map(([k, l]) => (
                          <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={x.priceKind === k}
                            onClick={() => patch(x.id!, { priceKind: k })}
                            className={`text-label min-h-10 rounded-sm ${x.priceKind === k ? "bg-surface-raised shadow-raised" : "text-ink-muted"}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      {x.priceKind !== "ask" && (
                        <span className="flex items-center rounded-md border border-line-strong/50 bg-surface-raised">
                          <span className="pl-3 text-ink-muted" aria-hidden="true">
                            ₦
                          </span>
                          <input
                            className="h-11 w-0 min-w-0 flex-1 bg-transparent px-2 tabular-nums outline-none"
                            size={1}
                            inputMode="numeric"
                            aria-label="Price in naira"
                            value={x.price ?? ""}
                            onChange={(e) => {
                              const d = e.target.value.replace(/\D/g, "").slice(0, 9);
                              patch(x.id!, { price: d ? Number(d) : null });
                            }}
                          />
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Group (optional)">
                        <input className="input" list="service-groups" value={x.group ?? ""} maxLength={PAGE_LIMITS.group} placeholder="e.g. Hair" onChange={(e) => patch(x.id!, { group: e.target.value })} />
                      </Field>
                      <Field label="How long (optional)">
                        <input className="input" value={x.duration ?? ""} maxLength={20} placeholder="e.g. 1 hr" onChange={(e) => patch(x.id!, { duration: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Short description (optional)" hint={`${(x.description ?? "").length} of ${PAGE_LIMITS.serviceDescription}`}>
                      <textarea
                        className="input min-h-20 resize-y py-2.5 leading-6"
                        value={x.description ?? ""}
                        maxLength={PAGE_LIMITS.serviceDescription}
                        onChange={(e) => patch(x.id!, { description: e.target.value })}
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <PhotoPick label={x.imageUrl ? "Change photo" : "Add a photo"} kind="service" prepare={prepareService} onPick={(u) => patch(x.id!, { imageUrl: u })} />
                      <button
                        type="button"
                        className="btn btn-ghost min-h-11 px-3 text-label text-danger"
                        onClick={() => (setList((l) => l.filter((y) => y.id !== x.id)), s.dirty())}
                      >
                        <Trash2 /> Remove service
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {list.length < PAGE_LIMITS.services && (
          <button
            type="button"
            className="btn btn-secondary min-h-11 justify-self-start px-4"
            onClick={() => {
              const id = tmpId("sv");
              setList((l) => [...l, { id, name: "", price: null, priceKind: "fixed" }]);
              setOpen(id);
              s.dirty();
            }}
          >
            <Plus /> Add a service
          </button>
        )}
        <SaveRow s={s} label="Save services" />
      </form>
    </Card>
  );
}

/* --------------------------------------------- team, FAQs and text */

function TeamCard({ page }: { page: BusinessPage }) {
  const s = useSave();
  const [on, setOn] = useState(!!page.showTeam);
  const [team, setTeam] = useState<TeamMember[]>(page.team ?? []);
  const patch = (id: string, p: Partial<TeamMember>) => (setTeam((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x))), s.dirty());
  return (
    <Card title="Team" status={on ? `${team.length} ${team.length === 1 ? "person" : "people"}` : "Off"}>
      <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), s.run(() => savePageAction({ showTeam: on, team })))}>
        <Toggle on={on} onChange={(v) => (setOn(v), s.dirty())} label="Show your team" note="Photo, name and role for each person." />
        {on && (
          <>
            <ul className="grid gap-2">
              {team.map((t) => (
                <li key={t.id} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
                  {t.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photoUrl} alt="" className="size-14 rounded-pill object-cover" />
                  ) : (
                    <PhotoPick label="Photo" kind="team" prepare={(f) => prepareCropped(f, 600, 600)} onPick={(u) => patch(t.id, { photoUrl: u })} />
                  )}
                  <input className="input" aria-label="Name" placeholder="Name" value={t.name} maxLength={40} onChange={(e) => patch(t.id, { name: e.target.value })} />
                  <input className="input" aria-label="Role" placeholder="Role, e.g. Barber" value={t.role ?? ""} maxLength={40} onChange={(e) => patch(t.id, { role: e.target.value })} />
                  <button type="button" className="btn btn-ghost min-h-11 px-3 text-danger" aria-label={`Remove ${t.name || "person"}`} onClick={() => (setTeam((x) => x.filter((y) => y.id !== t.id)), s.dirty())}>
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
            {team.length < PAGE_LIMITS.team && (
              <button type="button" className="btn btn-secondary min-h-11 justify-self-start px-4" onClick={() => (setTeam((x) => [...x, { id: tmpId("tm"), name: "" }]), s.dirty())}>
                <Plus /> Add a person
              </button>
            )}
            {s.errors.team && (
              <p role="alert" className="text-caption font-semibold text-danger">
                {s.errors.team}
              </p>
            )}
          </>
        )}
        <SaveRow s={s} />
      </form>
    </Card>
  );
}

function FaqCard({ page }: { page: BusinessPage }) {
  const s = useSave();
  const [on, setOn] = useState(!!page.showFaqs);
  const [faqs, setFaqs] = useState<FaqItem[]>(page.faqs ?? []);
  const patch = (id: string, p: Partial<FaqItem>) => (setFaqs((f) => f.map((x) => (x.id === id ? { ...x, ...p } : x))), s.dirty());
  return (
    <Card title="FAQs" status={on ? `${faqs.length} question${faqs.length === 1 ? "" : "s"}` : "Off"}>
      <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), s.run(() => savePageAction({ showFaqs: on, faqs })))}>
        <Toggle on={on} onChange={(v) => (setOn(v), s.dirty())} label="Show FAQs" note="Answer what people always ask before they book." />
        {on && (
          <>
            <ul className="grid gap-2">
              {faqs.map((f) => (
                <li key={f.id} className="grid gap-2 rounded-md border border-line p-3">
                  <input className="input" aria-label="Question" placeholder="Question, e.g. Do I need to book?" value={f.q} maxLength={120} onChange={(e) => patch(f.id, { q: e.target.value })} />
                  <textarea className="input min-h-20 resize-y py-2.5 leading-6" aria-label="Answer" placeholder="Answer" value={f.a} maxLength={400} onChange={(e) => patch(f.id, { a: e.target.value })} />
                  <button type="button" className="btn btn-ghost min-h-11 justify-self-start px-3 text-label text-danger" onClick={() => (setFaqs((x) => x.filter((y) => y.id !== f.id)), s.dirty())}>
                    <Trash2 /> Remove
                  </button>
                </li>
              ))}
            </ul>
            {faqs.length < PAGE_LIMITS.faqs && (
              <button type="button" className="btn btn-secondary min-h-11 justify-self-start px-4" onClick={() => (setFaqs((x) => [...x, { id: tmpId("fq"), q: "", a: "" }]), s.dirty())}>
                <Plus /> Add a question
              </button>
            )}
            {s.errors.faqs && (
              <p role="alert" className="text-caption font-semibold text-danger">
                {s.errors.faqs}
              </p>
            )}
          </>
        )}
        <SaveRow s={s} />
      </form>
    </Card>
  );
}

function TextCard({ page }: { page: BusinessPage }) {
  const s = useSave();
  const [on, setOn] = useState(!!page.showText);
  const [title, setTitle] = useState(page.textTitle ?? "");
  const [body, setBody] = useState(page.textBody ?? "");
  return (
    <Card title="A text section" status={on && title ? title : "Off"}>
      <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), s.run(() => savePageAction({ showText: on, textTitle: title, textBody: body })))}>
        <Toggle on={on} onChange={(v) => (setOn(v), s.dirty())} label="Show a text section" note="A title and a short block: your promise, a policy, how bookings work." />
        {on && (
          <>
            <Field label="Title" error={s.errors.textTitle}>
              <input className="input" value={title} maxLength={PAGE_LIMITS.textTitle} placeholder="e.g. Our promise" onChange={(e) => (setTitle(e.target.value), s.dirty())} />
            </Field>
            <Field label="Text" hint={`${body.length} of ${PAGE_LIMITS.textBody}`} error={s.errors.textBody}>
              <textarea className="input min-h-28 resize-y py-2.5 leading-6" value={body} maxLength={PAGE_LIMITS.textBody} onChange={(e) => (setBody(e.target.value), s.dirty())} />
            </Field>
          </>
        )}
        <SaveRow s={s} />
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------- page */

export function PageEditor({ business: b }: { business: Business }) {
  const page = b.page ?? {};
  const inStore = (b.serveMode ?? "in_store") === "in_store";
  return (
    <div className="grid gap-3">
      <HeroCard b={b} />
      <ModeCard b={b} />
      <AboutCard b={b} />
      <ServicesCard b={b} />
      <Card title="Portfolio" status={b.portfolio.length ? `${b.portfolio.length} of ${PAGE_LIMITS.portfolio}` : "Show your best work"}>
        <PortfolioEditor initial={b.portfolio} />
      </Card>
      <TeamCard page={page} />
      <FaqCard page={page} />
      <TextCard page={page} />
      <Card title="Hours and location" status={inStore ? (b.address ? "Added" : "Add your address") : "Not shown: customers don't visit you"}>
        <p className="text-body text-ink-muted">
          {inStore ? "Your opening hours and address are in your profile." : "You chose online or we-come-to-you, so your page has no hours or address."}
        </p>
        {inStore && (
          <Link href="/app/settings/profile#about" className="btn btn-secondary min-h-11 justify-self-start px-4 text-label">
            Edit hours and address
          </Link>
        )}
      </Card>
      <p className="text-caption px-1 text-ink-muted">Sections you leave empty don&apos;t show on your page. Reviews come from people who redeemed a Tikka.</p>
    </div>
  );
}
