"use client";

import { useEffect } from "react";

/**
 * Turns on the scroll reveals for the business page: one IntersectionObserver for every
 * [data-reveal] element. Without JavaScript (or before it runs) nothing is hidden.
 */
export function Reveal({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    root.classList.add("biz-reveal-on");
    return () => io.disconnect();
  }, [rootId]);
  return null;
}
