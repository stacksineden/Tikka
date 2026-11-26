"use client";

// "Charged": once, per hour or per item (lib/units.ts; supabase/migrations/20261220100000_per_hour_per_item.sql).
// Shared by Your page's services and the new-business setup. Per hour: how many hours a customer can
// book. Per item: what one is ("photo"), how many they can pick, and how long each takes.

import { MAX_HOURS, MAX_ITEMS, perText, unitRange } from "@/lib/units";
import type { ServiceItem } from "@/lib/types";

const num = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 3);
  return d ? Number(d) : undefined;
};

export function UnitFields({ x, patch }: { x: ServiceItem; patch: (p: Partial<ServiceItem>) => void }) {
  if (x.eventDay || x.perPerson) return null;
  const r = unitRange(x);
  const top = x.unit === "hour" ? MAX_HOURS : MAX_ITEMS;
  return (
    <div className="grid gap-2.5">
      <span className="text-label">Charged</span>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup" aria-label="Charged">
        {(
          [
            [undefined, "Once"],
            ["hour", "Per hour"],
            ["item", "Per item"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={x.unit === k}
            onClick={() =>
              patch(
                k === "hour"
                  ? { unit: "hour", unitMin: 1, unitMax: 4, unitMinutes: undefined }
                  : k === "item"
                    ? { unit: "item", unitMin: 1, unitMax: 10, unitLabel: x.unitLabel ?? "" }
                    : { unit: undefined, unitMin: undefined, unitMax: undefined, unitLabel: undefined, unitMinutes: undefined },
              )
            }
            className={`text-label min-h-10 rounded-sm ${x.unit === k ? "bg-surface-raised shadow-raised" : "text-ink-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {x.unit === "item" && (
        <label className="grid gap-1.5">
          <span className="text-label">What&apos;s one?</span>
          <input
            className="input"
            value={x.unitLabel ?? ""}
            maxLength={20}
            placeholder="e.g. photo, look, outfit"
            onChange={(e) => patch({ unitLabel: e.target.value })}
          />
        </label>
      )}

      {x.unit && r && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-label">At least</span>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                value={x.unitMin ?? ""}
                onChange={(e) => patch({ unitMin: num(e.target.value) })}
                onBlur={() => patch({ unitMin: r.min, unitMax: r.max })}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-label">At most</span>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                value={x.unitMax ?? ""}
                onChange={(e) => patch({ unitMax: num(e.target.value) })}
                onBlur={() => patch({ unitMin: r.min, unitMax: r.max })}
              />
            </label>
          </div>
          {x.unit === "item" && (
            <label className="grid gap-1.5">
              <span className="text-label">
                How long each takes, in minutes <span className="font-normal text-ink-muted">(optional)</span>
              </span>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                value={x.unitMinutes ?? ""}
                placeholder="Leave empty if the time doesn't change"
                onChange={(e) => patch({ unitMinutes: num(e.target.value) })}
              />
            </label>
          )}
          <p className="text-caption text-ink-muted">
            Customers pick {x.unit === "hour" ? "how many hours" : "how many"}, from {r.min} to {r.max} (at most {top}). The price above is {perText(x)}
            {x.unit === "hour" ? ", and the booking takes that many hours." : "."}
          </p>
        </>
      )}
    </div>
  );
}
