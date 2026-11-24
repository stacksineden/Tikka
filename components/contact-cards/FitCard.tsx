"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_MM } from "@/lib/contact-cards";

const PX_PER_MM = 96 / 25.4;

/** Shows a card (drawn at real size in mm) scaled to fill the space it's given. */
export function FitCard({ children, widthMm = CARD_MM.w, className }: { children: React.ReactNode; widthMm?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (el.clientWidth > 0) setZoom(el.clientWidth / (widthMm * PX_PER_MM));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthMm]);
  return (
    // The card sits absolutely inside, so its real-size width never stretches a narrow grid cell.
    <div ref={ref} className={className} style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden", aspectRatio: `${widthMm} / ${(widthMm * CARD_MM.h) / CARD_MM.w}` }}>
      <div data-theme="light" style={{ position: "absolute", left: 0, top: 0, zoom, width: "fit-content" }}>
        {children}
      </div>
    </div>
  );
}
