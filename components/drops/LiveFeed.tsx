"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/dashboard/Home";
import type { ActivityEvent } from "@/lib/types";

/** The drop's live feed. Polls every few seconds while the drop runs; Supabase Realtime replaces this in M1. */
export function LiveFeed({ dropId, initial, now: initialNow, live }: { dropId: string; initial: ActivityEvent[]; now: string; live: boolean }) {
  const [items, setItems] = useState(initial);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/drops/${dropId}/feed`, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { now: string; items: ActivityEvent[] };
        setItems(data.items);
        setNow(data.now);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [dropId, live]);

  return <ActivityFeed events={items} now={new Date(now)} live={live} />;
}
