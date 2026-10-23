"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const two = (n: number) => String(n).padStart(2, "0");

/** "2d 04:12:33", ticking every second. The server renders the first value. */
export function Countdown({ to, from }: { to: string; from: string }) {
  const [now, setNow] = useState(() => new Date(from).getTime());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = parts(new Date(to).getTime() - now);
  return (
    <span className="font-mono tabular-nums" suppressHydrationWarning>
      {p.d > 0 ? `${p.d}d ` : ""}
      {two(p.h)}:{two(p.m)}:{two(p.s)}
    </span>
  );
}
