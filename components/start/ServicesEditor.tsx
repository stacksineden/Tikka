"use client";

// NEW DIRECTION: the services screen in setup. Every ticked service needs a price (deposits are
// worked out from it): a fixed price, or a starting price ("From ₦15,000") for prices that move.
// Each service, and each of its choices, has its own price and how long it takes.

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { UnitFields } from "@/components/page/UnitFields";
import { durationLabel, type PresetService } from "@/lib/presets";
import type { ServiceItem, ServiceOption } from "@/lib/types";
import { perText } from "@/lib/units";

export const LENGTHS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480, 600, 720];
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

/** A ticked service with a missing price can't take a deposit, so setup asks for one. */
export function serviceProblem(s: ServiceItem): string | null {
  if (!s.name.trim()) return "Name this service.";
  if (s.unit === "item" && !s.unitLabel?.trim()) return "Say what one is, like photo or look.";
  if (s.options?.length) {
    if (s.options.some((o) => !o.label.trim())) return "Name each choice.";
    if (s.options.some((o) => !(o.price > 0))) return "Add a price for each choice.";
    return null;
  }
  return (s.price ?? 0) > 0 ? null : "Add a price.";
}

export function priceSummary(s: ServiceItem): string {
  const from = s.priceKind === "from";
  if (s.options?.length) {
    const low = Math.min(...s.options.map((o) => o.price || 0));
    return `${s.options.length} ${s.perPerson ? "prices" : "choices"} · from ${naira(low)}`;
  }
  const price = (s.price ?? 0) > 0 ? `${from ? "From " : ""}${naira(s.price!)}${s.unit ? ` ${perText(s)}` : ""}` : "No price yet";
  return s.minutes ? `${price} · ${durationLabel(s.minutes)}` : price;
}

export function ServicesEditor({ services, onChange, city }: { services: PresetService[]; onChange: (next: PresetService[]) => void; city: string }) {
  const [editing, setEditing] = useState<number | null>(null);
  const set = (i: number, patch: Partial<ServiceItem>) => onChange(services.map((x, j) => (j === i ? { ...x, item: { ...x.item, ...patch } } : x)));

  return (
    <div className="grid gap-2.5">
      {services.map((s, i) => {
        const problem = s.on ? serviceProblem(s.item) : null;
        const open = editing === i;
        return (
          <div key={i} className={`grid gap-3 rounded-card border bg-surface-raised px-4 py-3.5 ${problem && !open ? "border-danger" : "border-line"} ${s.on ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3">
              <Tick on={s.on} label={`I do ${s.item.name || "this service"}`} onClick={() => onChange(services.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {s.item.name || "New service"} {s.item.eventDay && <span className="text-caption ml-1 rounded-pill bg-gold-soft px-2 py-0.5 whitespace-nowrap text-gold-text">Event day</span>}
                </div>
                <div className={`text-caption ${problem ? "text-danger" : "text-ink-muted"}`}>{problem ?? priceSummary(s.item)}</div>
              </div>
              {!open && (
                <button
                  type="button"
                  aria-label={`Remove ${s.item.name || "this service"}`}
                  className="grid size-11 shrink-0 place-items-center text-ink-muted"
                  onClick={() => {
                    onChange(services.filter((_, j) => j !== i));
                    setEditing(null);
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="text-label inline-flex min-h-11 items-center gap-1 px-2 text-brand" aria-expanded={open} onClick={() => setEditing(open ? null : i)}>
                {open ? (
                  <>
                    <Check size={16} aria-hidden="true" /> Done
                  </>
                ) : (
                  <>
                    <Pencil size={16} aria-hidden="true" /> Edit
                  </>
                )}
              </button>
            </div>

            {open && (
              <div className="grid gap-4 border-t border-line pt-3.5">
                <Labelled id={`sv-name-${i}`} label="Name">
                  <input id={`sv-name-${i}`} className="input" value={s.item.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} placeholder="e.g. Frontal wig install" />
                </Labelled>

                <div>
                  <span className="text-label mb-1.5 block">Your price</span>
                  <div className="flex flex-wrap gap-2">
                    <Chip on={s.item.priceKind !== "from"} onClick={() => set(i, { priceKind: "fixed" })}>
                      Fixed price
                    </Chip>
                    <Chip on={s.item.priceKind === "from"} onClick={() => set(i, { priceKind: "from" })}>
                      Starts from
                    </Chip>
                  </div>
                  <p className="text-caption mt-1.5 text-ink-muted">
                    {s.item.priceKind === "from" ? `Customers see "From ${naira(s.item.price || 0)}". The deposit is worked out on this starting price.` : "Customers see exactly this price."}
                  </p>
                </div>

                {s.item.options?.length ? (
                  <div className="grid gap-2.5">
                    <span className="text-label">{s.item.perPerson ? "Price per person" : "Choices"}</span>
                    {s.item.options.map((o, j) => {
                      const setOpt = (patch: Partial<ServiceOption>) => {
                        const next = s.item.options!.map((x, k) => (k === j ? { ...x, ...patch } : x));
                        set(i, { options: next, price: Math.min(...next.map((x) => x.price || 0)), minutes: Math.min(...next.map((x) => x.minutes)) });
                      };
                      return (
                        <div key={j} className="grid gap-2 rounded-md bg-surface-sunken p-3">
                          <div className="flex items-center gap-2">
                            <input aria-label={`Choice ${j + 1} name`} className="input min-w-0 flex-1" value={o.label} maxLength={30} onChange={(e) => setOpt({ label: e.target.value })} placeholder="e.g. Long" />
                            {s.item.options!.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Remove ${o.label || "this choice"}`}
                                className="grid size-11 shrink-0 place-items-center text-ink-muted"
                                onClick={() => {
                                  const next = s.item.options!.filter((_, k) => k !== j);
                                  set(i, { options: next, price: Math.min(...next.map((x) => x.price || 0)), minutes: Math.min(...next.map((x) => x.minutes)) });
                                }}
                              >
                                <Trash2 size={18} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Naira label={`${o.label || "Choice"} price`} value={o.price} onChange={(v) => setOpt({ price: v })} />
                            <TimeSelect label={`${o.label || "Choice"} takes`} value={o.minutes} onChange={(v) => setOpt({ minutes: v })} />
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand"
                      onClick={() => {
                        const last = s.item.options![s.item.options!.length - 1];
                        set(i, { options: [...s.item.options!, { label: "", price: last?.price ?? 0, minutes: last?.minutes ?? 60 }] });
                      }}
                    >
                      <Plus size={16} aria-hidden="true" /> Add a {s.item.perPerson ? "price" : "choice"}
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <Naira label={s.item.priceKind === "from" ? "Starting price" : "Price"} value={s.item.price ?? 0} onChange={(v) => set(i, { price: v })} />
                      <TimeSelect label="Takes about" value={s.item.minutes ?? 60} onChange={(v) => set(i, { minutes: v, duration: durationLabel(v) })} />
                    </div>
                    <button
                      type="button"
                      className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand"
                      onClick={() => set(i, { options: [{ label: "Standard", price: s.item.price ?? 0, minutes: s.item.minutes ?? 60 }, { label: "", price: s.item.price ?? 0, minutes: s.item.minutes ?? 60 }] })}
                    >
                      <Plus size={16} aria-hidden="true" /> Different lengths or sizes? Add choices
                    </button>
                  </div>
                )}

                <UnitFields x={s.item} patch={(p) => set(i, p)} />

                <label className="flex min-h-11 items-center gap-3">
                  <Tick on={!!s.item.eventDay} label="Booked as a whole day" onClick={() => set(i, { eventDay: !s.item.eventDay || undefined })} />
                  <span>
                    <b className="block text-[15px]">Booked as a whole day</b>
                    <span className="text-caption text-ink-muted">Weddings and shoots: customers pick a date and start time.</span>
                  </span>
                </label>

                <button
                  type="button"
                  className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-danger"
                  onClick={() => {
                    onChange(services.filter((_, j) => j !== i));
                    setEditing(null);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove this service
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-secondary rounded-pill justify-self-start"
        onClick={() => {
          onChange([...services, { trade: services[0]?.trade ?? "hair", on: true, item: { name: "", price: 0, priceKind: "fixed", minutes: 60, duration: durationLabel(60) } }]);
          setEditing(services.length);
        }}
      >
        <Plus aria-hidden="true" /> Add a service
      </button>
      <p className="text-caption text-ink-muted">Prices start from what&apos;s typical in {city}. Every service you tick needs a price so customers can pay a deposit.</p>
    </div>
  );
}

function Labelled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-label mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function Naira({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-caption text-ink-muted">{label}</span>
      <span className="flex h-12 items-center rounded-md border border-line-strong bg-surface-raised pl-3 focus-within:outline-2 focus-within:outline-brand">
        <span className="text-ink-muted">₦</span>
        <input inputMode="numeric" className="h-full min-w-0 flex-1 bg-transparent pr-2 pl-1 outline-none" value={value ? value.toLocaleString("en-NG") : ""} placeholder="0" onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)} />
      </span>
    </label>
  );
}

function TimeSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const list = LENGTHS.includes(value) ? LENGTHS : [...LENGTHS, value].sort((a, b) => a - b);
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-caption text-ink-muted">{label}</span>
      <select className="input h-12 min-w-0 px-3" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((m) => (
          <option key={m} value={m}>
            {durationLabel(m)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}>
      {children}
    </button>
  );
}

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised text-transparent"}`}>
      <Check size={16} aria-hidden="true" />
    </button>
  );
}
