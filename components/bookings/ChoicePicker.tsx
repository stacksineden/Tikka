"use client";

import { Minus, Plus } from "lucide-react";
import { Chip } from "@/components/today/Sheet";
import { MAX_PEOPLE, priceBooking, type BookingChoice } from "@/lib/booking-price";
import { naira } from "@/lib/format";
import type { ServiceItem } from "@/lib/types";
import { countText, perText, unitRange, unitWord } from "@/lib/units";

/**
 * The owner's "which one / how many" for Add a booking and New sale (28 Nov 2026): the option
 * (Short / Long), how many hours, photos or looks, or how many people, with the total worked out
 * like the customer's booking sheet (priceBooking()). The server prices a booking again.
 */
export function ChoicePicker({ service, choice, onChange }: { service: ServiceItem; choice: BookingChoice; onChange: (c: BookingChoice) => void }) {
  const opts = service.options ?? [];
  const range = !service.perPerson && !service.eventDay ? unitRange(service) : null;
  const qty = range ? Math.max(range.min, Math.min(range.max, choice.qty ?? range.min)) : 1;
  const price = priceBooking(service, { ...choice, qty }, 0, undefined);
  const people = opts.map((_, i) => (i === 0 ? 1 : (choice.people?.[i] ?? 0)));
  const one = opts.length ? opts[Math.max(0, Math.min(opts.length - 1, choice.option ?? 0))].price : (service.price ?? 0);

  return (
    <div className="grid gap-3 rounded-md bg-surface-sunken p-3">
      {opts.length > 1 && !service.perPerson && (
        <div className="grid gap-1.5">
          <span className="text-label">Which one?</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Which one">
            {opts.map((o, i) => (
              <Chip key={o.label} on={(choice.option ?? 0) === i} onClick={() => onChange({ ...choice, option: i })}>
                {o.label} · {naira(o.price)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {service.perPerson && opts.length > 1 && (
        <div className="grid gap-2">
          <span className="text-label">
            {opts[0].label} · {naira(opts[0].price)}
          </span>
          {opts.slice(1).map((o, j) => {
            const i = j + 1;
            return (
              <Counter
                key={o.label}
                label={`${o.label} · ${naira(o.price)}`}
                value={people[i]}
                min={0}
                max={MAX_PEOPLE}
                onChange={(n) => onChange({ ...choice, people: people.map((p, k) => (k === i ? n : p)) })}
              />
            );
          })}
        </div>
      )}
      {range && (
        <Counter
          label={service.unit === "hour" ? "How many hours?" : `How many ${unitWord(service.unitLabel || "item", 2)}?`}
          value={qty}
          min={range.min}
          max={range.max}
          unit={countText(service, qty).replace(/^\d+ /, "")}
          onChange={(n) => onChange({ ...choice, qty: n })}
        />
      )}
      <p className="text-body flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
        <span className="text-ink-muted">{range ? `${naira(one)} ${perText(service)} × ${qty}` : "Total"}</span>
        <b className="text-code">{naira(price.totalNaira)}</b>
      </p>
    </div>
  );
}

function Counter({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-label min-w-0">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="grid size-11 place-items-center rounded-pill border border-line-strong bg-surface-raised disabled:opacity-30">
          <Minus size={18} aria-hidden="true" />
        </button>
        <span className="min-w-12 text-center" aria-live="polite">
          <b className="text-code text-[20px]">{value}</b>
          {unit && <span className="text-caption block leading-none text-ink-muted">{unit}</span>}
        </span>
        <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="grid size-11 place-items-center rounded-pill border border-line-strong bg-surface-raised disabled:opacity-30">
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
