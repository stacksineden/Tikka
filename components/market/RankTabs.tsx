"use client";

import { useState, type ReactNode } from "react";

/** The ranking table's tabs. All four lists are server-rendered; this only picks which shows. */
export function RankTabs({ tabs }: { tabs: { id: string; label: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div>
      <div role="tablist" aria-label="Rank drops by" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`rank-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`rank-panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`text-label min-h-10 shrink-0 rounded-pill px-4 ${active === t.id ? "bg-ink text-surface" : "bg-surface-sunken text-ink-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`rank-panel-${t.id}`} aria-labelledby={`rank-${t.id}`} hidden={active !== t.id}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
