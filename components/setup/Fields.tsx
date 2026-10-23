"use client";

import { Camera, Check, ChevronDown, ImageUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { checkPrefix, checkSlug } from "@/app/app/actions";
import { checkBrandColor, normalizeHex, SWATCHES } from "@/lib/color";
import { prepareCover, prepareLogo } from "@/lib/media-client";
import { CATEGORIES, citiesFor, STATE_NAMES } from "@/lib/nigeria";
import { ACTION_KINDS, actionMeta, formatNgPhone, LIMITS, type Errors } from "@/lib/setup";
import type { ActionKind, Business, CardBackground, PatternId } from "@/lib/types";

/* ---------------------------------------------------------------- base */

export function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  counter,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  counter?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="grid gap-1.5" id={id}>
      <div className="flex items-baseline justify-between gap-3">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-label text-ink">
            {label}
          </label>
        ) : (
          <span className="text-label text-ink">{label}</span>
        )}
        {counter && <span className="text-caption tabular-nums text-ink-muted">{counter}</span>}
      </div>
      {children}
      {hint && !error && <p className="text-caption text-ink-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  id,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max?: number;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} counter={max ? `${value.length} / ${max}` : undefined}>
      <input
        id={inputId}
        className="input"
        value={value}
        maxLength={max}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  error,
  hint,
  max,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  max: number;
  id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} counter={`${value.length} / ${max}`}>
      <textarea
        id={inputId}
        className="input h-auto min-h-28 py-3 leading-6"
        value={value}
        maxLength={max}
        rows={4}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  error?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} htmlFor={id}>
      <div className="relative">
      <select
        id={id}
        className="input appearance-none pr-10"
        value={value}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      </div>
    </FieldShell>
  );
}

/* ------------------------------------------------------------ location */

export function LocationFields({
  state,
  city,
  area,
  onChange,
  errors,
}: {
  state: string;
  city: string;
  area: string;
  onChange: (patch: { state?: string; city?: string; area?: string }) => void;
  errors: Errors;
}) {
  const listId = useId();
  const cities = citiesFor(state);
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Location</legend>
      <Select
        label="State"
        value={state}
        placeholder="Choose your state"
        options={STATE_NAMES}
        error={errors.state}
        onChange={(v) => {
          const c = citiesFor(v);
          onChange({ state: v, city: c.length === 1 ? c[0] : c.includes(city) ? city : "" });
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="City or town"
          value={city}
          onChange={(v) => onChange({ city: v })}
          error={errors.city}
          list={listId}
          autoComplete="address-level2"
          placeholder={cities[0] ? `e.g. ${cities[0]}` : "City"}
        />
        <TextInput
          label="Area (optional)"
          value={area}
          onChange={(v) => onChange({ area: v })}
          autoComplete="address-level3"
          placeholder="e.g. Lekki"
        />
      </div>
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </fieldset>
  );
}

export function CategorySelect({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <FieldShell label="Category" error={error}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
        {CATEGORIES.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(c)}
              className={`text-label min-h-11 rounded-pill border px-4 transition-colors ${
                on ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 bg-surface-raised text-ink"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

/* ---------------------------------------------------------------- logo */

export function LogoField({
  value,
  initials,
  brandColor,
  onChange,
  error,
}: {
  value?: string;
  initials: string;
  brandColor: string;
  onChange: (v: string | undefined) => void;
  error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setProblem(undefined);
    try {
      onChange(await prepareLogo(file));
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <FieldShell label="Logo" error={problem ?? error} hint="Square works best, at least 256px.">
      <div className="flex items-center gap-4">
        <span
          className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-pill border-2 border-line text-heading text-on-brand"
          style={{ background: brandColor }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Your logo" className="size-full object-cover" />
          ) : (
            initials || <Camera size={24} aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
            {value ? "Change logo" : "Upload logo"}
          </button>
          {value && (
            <button type="button" className="btn btn-ghost px-3" onClick={() => onChange(undefined)} aria-label="Remove logo">
              <Trash2 />
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </FieldShell>
  );
}

/* --------------------------------------------------------------- colour */

export function ColorField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  // What the person is typing in the hex box; null shows the current colour.
  const [typing, setTyping] = useState<string | null>(null);
  const pick = (v: string) => {
    setTyping(null);
    onChange(v);
  };
  const hex = normalizeHex(value);
  const check = hex ? checkBrandColor(hex) : null;

  return (
    <FieldShell label="Brand colour" error={error} htmlFor={id}>
      <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="Suggested colours">
        {SWATCHES.map((s) => {
          const on = hex === s.hex;
          return (
            <button
              key={s.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.name}
              onClick={() => pick(s.hex)}
              className={`grid aspect-square min-h-11 place-items-center rounded-pill text-on-brand ring-offset-2 ring-offset-surface-raised ${
                on ? "ring-2 ring-ink" : ""
              }`}
              style={{ background: s.hex }}
            >
              {on && <Check size={18} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="relative grid size-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-line-strong">
          <span className="sr-only">Pick any colour</span>
          <span className="absolute inset-0" style={{ background: hex ?? "transparent" }} aria-hidden="true" />
          <input
            type="color"
            value={hex ?? "#000000"}
            onChange={(e) => pick(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <input
          id={id}
          className="input font-mono uppercase"
          value={typing ?? value}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="characters"
          aria-label="Colour code"
          onChange={(e) => {
            setTyping(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          onBlur={() => setTyping(null)}
        />
      </div>
      {check && (
        <div
          className={`text-caption mt-1 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 ${
            check.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
          role="status"
        >
          {check.ok ? (
            <>
              <Check size={14} strokeWidth={3} aria-hidden="true" />
              Readable with {check.on === "#FFFFFF" ? "white" : "dark"} text ({check.ratio.toFixed(1)}:1)
            </>
          ) : (
            <>
              <X size={14} strokeWidth={3} aria-hidden="true" />
              Text would be hard to read on this colour.
              {check.suggestion && (
                <button
                  type="button"
                  onClick={() => pick(check.suggestion!)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-pill bg-surface-raised px-2.5 font-semibold text-ink"
                >
                  <span className="size-3.5 rounded-pill" style={{ background: check.suggestion }} aria-hidden="true" />
                  Use {check.suggestion}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </FieldShell>
  );
}

/* ----------------------------------------------------------- background */

const PATTERNS: { id: PatternId; label: string }[] = [
  { id: "dots", label: "Dots" },
  { id: "stripes", label: "Stripes" },
  { id: "grid", label: "Grid" },
  { id: "sparks", label: "Sparks" },
];

export function BackgroundField({
  value,
  brandColor,
  onChange,
  error,
}: {
  value: CardBackground;
  brandColor: string;
  onChange: (v: CardBackground) => void;
  error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const [lastPhoto, setLastPhoto] = useState(value.type === "photo" ? value.url : undefined);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const url = await prepareCover(file);
      setLastPhoto(url);
      onChange({ type: "photo", url });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const tab = (t: CardBackground["type"], label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value.type === t}
      onClick={() => {
        if (t === "color") onChange({ type: "color" });
        if (t === "pattern") onChange({ type: "pattern", pattern: value.type === "pattern" ? value.pattern : "dots" });
        if (t === "photo") {
          if (lastPhoto) onChange({ type: "photo", url: lastPhoto });
          else input.current?.click();
        }
      }}
      className={`text-label min-h-11 flex-1 rounded-md ${value.type === t ? "bg-surface-raised text-ink shadow-raised" : "text-ink-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <FieldShell label="Card background" error={problem ?? error}>
      <div className="flex gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup" aria-label="Background type">
        {tab("color", "Colour")}
        {tab("pattern", "Pattern")}
        {tab("photo", "Photo")}
      </div>
      {value.type === "pattern" && (
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Pattern">
          {PATTERNS.map((p) => {
            const on = value.pattern === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ type: "pattern", pattern: p.id })}
                className={`grid gap-1.5 rounded-md p-1.5 text-center ${on ? "ring-2 ring-brand" : "ring-1 ring-line"}`}
              >
                <span className="relative block h-12 overflow-hidden rounded-sm" style={{ background: brandColor }} aria-hidden="true">
                  <span className={`tk-pattern tk-pattern--${p.id} !inset-0 ![mask:none] ![-webkit-mask:none]`} />
                </span>
                <span className="text-caption">{p.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {value.type === "photo" && (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="Your cover photo" className="h-14 w-28 rounded-sm object-cover" />
          <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
            Change photo
          </button>
        </div>
      )}
      {value.type === "photo" || busy ? null : (
        <p className="text-caption text-ink-muted">
          {value.type === "color" ? "Your brand colour with Tikka's soft shapes." : "Tinted with your brand colour."}
        </p>
      )}
      {value.type === "photo" && <p className="text-caption text-ink-muted">Photos without text work best. We crop it to the top of the card.</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </FieldShell>
  );
}

/* -------------------------------------------------------------- actions */

export function ActionsField({
  value,
  onChange,
  errors,
  servicesSlot,
}: {
  value: Business["actions"];
  onChange: (v: Business["actions"]) => void;
  errors: Errors;
  /** What sits under the Services button: the services editor in setup, a pointer to it in Settings. */
  servicesSlot?: React.ReactNode;
}) {
  const used = new Set(value.map((a) => a.kind));
  const free = ACTION_KINDS.filter((a) => !used.has(a.kind));
  const set = (i: number, v: string) => onChange(value.map((a, j) => (j === i ? { ...a, value: v } : a)));

  return (
    <FieldShell
      label="Buttons on your card"
      error={errors.actions}
      hint={`People tap these on your card. Add 1 to ${LIMITS.actions}.`}
      counter={`${value.length} / ${LIMITS.actions}`}
    >
      <ul className="grid gap-3">
        {value.map((a, i) => {
          const meta = actionMeta(a.kind);
          const display = meta.input === "phone" && a.value.startsWith("+234") ? formatNgPhone(a.value) : a.value;
          return (
            <li key={a.kind} className="rounded-md border border-line bg-surface-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label">{meta.label}</span>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remove ${meta.label}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              {meta.input === "none" ? (
                <div className="grid gap-3">
                  <p className="text-caption text-ink-muted">Opens the Services tab on your card, with everything you list and its price.</p>
                  {servicesSlot}
                </div>
              ) : (
              <div className="flex gap-2">
                {meta.input === "phone" && (
                  <span className="text-body grid h-12 w-16 shrink-0 place-items-center rounded-md bg-surface-sunken font-semibold">+234</span>
                )}
                {meta.input === "handle" && (
                  <span className="text-body grid h-12 w-10 shrink-0 place-items-center rounded-md bg-surface-sunken font-semibold">@</span>
                )}
                <input
                  className="input"
                  value={display}
                  placeholder={meta.placeholder}
                  aria-label={`${meta.label}: ${meta.input === "phone" ? "number" : meta.input === "url" ? "link" : meta.input === "handle" ? "username" : "address"}`}
                  aria-invalid={!!errors[`action-${i}`]}
                  inputMode={meta.input === "phone" ? "tel" : meta.input === "url" ? "url" : "text"}
                  autoComplete={meta.input === "phone" ? "tel-national" : "off"}
                  autoCapitalize={meta.input === "text" ? "sentences" : "none"}
                  onChange={(e) => set(i, e.target.value)}
                />
              </div>
              )}
              {errors[`action-${i}`] && (
                <p role="alert" className="text-caption mt-1.5 font-semibold text-danger">
                  {errors[`action-${i}`]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {value.length < LIMITS.actions && (
        <div className="mt-1 flex flex-wrap gap-2">
          {free.map((a) => (
            <button
              key={a.kind}
              type="button"
              onClick={() => onChange([...value, { kind: a.kind as ActionKind, value: "" }])}
              className="text-label inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-dashed border-line-strong px-3.5 text-ink"
            >
              <Plus size={16} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </FieldShell>
  );
}

/* --------------------------------------------------------------- prefix */

export function PrefixField({
  value,
  name,
  onChange,
  error,
}: {
  value: string;
  name: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const [state, setState] = useState<{ checked: string; available: boolean; alternatives: string[] } | null>(null);

  useEffect(() => {
    if (!/^[A-Z]{2}$/.test(value)) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkPrefix(value, name);
      if (live) setState({ checked: value, ...r });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, name]);

  const current = state?.checked === value ? state : null;
  return (
    <FieldShell
      label="Code prefix"
      htmlFor={id}
      error={error ?? (current && !current.available ? `${value} is taken by another business.` : undefined)}
      hint="The two letters at the start of your codes."
    >
      <div className="flex items-center gap-3">
        <input
          id={id}
          className="input w-24 text-center font-mono text-[20px] font-bold uppercase tracking-[0.12em]"
          value={value}
          maxLength={2}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error || (current ? !current.available : false)}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
        />
        <span className="font-mono text-[15px] font-bold tracking-[0.08em] text-ink-muted" aria-hidden="true">
          {value || "XX"}-7X4QP
        </span>
        {current?.available && (
          <span className="text-caption ml-auto flex items-center gap-1 font-semibold text-success">
            <Check size={14} strokeWidth={3} aria-hidden="true" />
            Available
          </span>
        )}
      </div>
      {current && !current.available && current.alternatives.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-muted">Try</span>
          {current.alternatives.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange(a)}
              className="min-h-10 rounded-pill bg-brand-soft px-3.5 font-mono text-[14px] font-bold tracking-[0.08em] text-brand"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </FieldShell>
  );
}

/* ---------------------------------------------------------- page address */

export function SlugField({
  value,
  city,
  onChange,
  error,
}: {
  value: string;
  city: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const [state, setState] = useState<{ checked: string; available: boolean; problem?: string; alternatives: string[] } | null>(null);

  useEffect(() => {
    if (value.length < 3) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkSlug(value, city);
      if (live) setState({ checked: value, ...r });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, city]);

  const current = state?.checked === value ? state : null;
  return (
    <FieldShell
      label="Your page address"
      htmlFor={id}
      error={error ?? (current && !current.available ? current.problem : undefined)}
      hint="Your free business page. Put it in your Instagram and WhatsApp bio."
    >
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-line-strong bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand">
        <span className="text-body grid shrink-0 place-items-center bg-surface-sunken px-3 text-ink-muted">usetikka.com/</span>
        <input
          id={id}
          className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] text-ink outline-none"
          value={value}
          maxLength={30}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error || (current ? !current.available : false)}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        />
      </div>
      {current?.available && (
        <span className="text-caption flex items-center gap-1 font-semibold text-success">
          <Check size={14} strokeWidth={3} aria-hidden="true" />
          Available
        </span>
      )}
      {current && !current.available && current.alternatives.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-muted">Try</span>
          {current.alternatives.map((a) => (
            <button key={a} type="button" onClick={() => onChange(a)} className="min-h-10 rounded-pill bg-brand-soft px-3.5 font-mono text-[13px] font-bold text-brand">
              {a}
            </button>
          ))}
        </div>
      )}
    </FieldShell>
  );
}
