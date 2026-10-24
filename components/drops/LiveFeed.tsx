"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/dashboard/Home";
import { browserClient } from "@/lib/supabase/client";
import type { ActivityEvent } from "@/lib/types";

/** Drops in the database have uuids; demo drops don't. */
const REAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One Realtime channel per drop, shared by every feed on the page (phone and desktop layouts). */
const rooms = new Map<string, { listeners: Set<() => void>; close: () => void }>();

/**
 * Hear about new link activity on a drop. The database broadcasts a bare signal on the drop's
 * private channel for every new event (only the business's team may join); the feed itself
 * comes from our API. Returns a function that stops listening.
 */
function listen(dropId: string, onActivity: () => void): () => void {
  let room = rooms.get(dropId);
  if (!room) {
    const listeners = new Set<() => void>();
    const sb = browserClient();
    let closed = false;
    let channel: ReturnType<typeof sb.channel> | undefined;
    void (async () => {
      // Join as the signed-in person, not as a visitor: the socket can otherwise connect before
      // the session is read from the cookies.
      const { data } = await sb.auth.getSession();
      if (closed || !data.session) return;
      await sb.realtime.setAuth(data.session.access_token);
      // The client hands back an existing channel with the same name, and one that's already
      // subscribed can't take a listener, so let go of any left from a room that just closed.
      for (const old of sb.getChannels()) if (old.subTopic === `drop:${dropId}`) await sb.removeChannel(old);
      if (closed) return;
      channel = sb
        .channel(`drop:${dropId}`, { config: { private: true } })
        .on("broadcast", { event: "activity" }, () => listeners.forEach((f) => f()))
        .subscribe();
    })();
    room = {
      listeners,
      close: () => {
        closed = true;
        if (channel) void sb.removeChannel(channel);
      },
    };
    rooms.set(dropId, room);
  }
  room.listeners.add(onActivity);
  const r = room;
  return () => {
    r.listeners.delete(onActivity);
    if (r.listeners.size === 0) {
      r.close();
      rooms.delete(dropId);
    }
  };
}

/**
 * The drop's live feed. Real drops listen on the drop's private Realtime Broadcast channel (only
 * the business's team may join) and refresh the moment something happens, with a slow poll as a
 * backstop. Demo drops poll every few seconds.
 */
export function LiveFeed({ dropId, initial, now: initialNow, live }: { dropId: string; initial: ActivityEvent[]; now: string; live: boolean }) {
  const [items, setItems] = useState(initial);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    if (!live) return;
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch(`/api/drops/${dropId}/feed`, { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as { now: string; items: ActivityEvent[] };
          setItems(data.items);
          setNow(data.now);
        }
      } catch {
      } finally {
        busy = false;
      }
    };

    const real = REAL.test(dropId);
    const poll = setInterval(refresh, real ? 30_000 : 5000);
    const stop = real ? listen(dropId, refresh) : undefined;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      stop?.();
    };
  }, [dropId, live]);

  return <ActivityFeed events={items} now={new Date(now)} live={live} />;
}
