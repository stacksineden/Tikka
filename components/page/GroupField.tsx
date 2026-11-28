"use client";

import { OTHER_GROUP, PAGE_LIMITS } from "@/lib/page";

/**
 * Which group a service sits in ("Bridal", "Makeup", "Photography"): tap one the business already
 * uses, or type a new one. On the page each group is a tab; services without one show under
 * "Other" (withGroups()).
 */
export function GroupField({ id, value, groups, onChange }: { id: string; value: string; groups: string[]; onChange: (v: string) => void }) {
  const current = value.trim();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-label">
        Group
      </label>
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Your groups">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={g === current}
              onClick={() => onChange(g)}
              className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold ${g === current ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <input id={id} className="input" value={value} maxLength={PAGE_LIMITS.group} placeholder={groups.length ? "Or type a new group" : "e.g. Bridal, Makeup, Photography"} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <span className="text-caption text-ink-muted">Each group is a tab on your page. Services without one show under &quot;{OTHER_GROUP}&quot;.</span>
    </div>
  );
}
