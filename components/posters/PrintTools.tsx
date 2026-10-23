"use client";

import { ChevronLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Shows the sheet scaled to the screen; prints it at 100%. Not printed itself. */
export function FitSheet({ widthMm, children }: { widthMm: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    // Re-fit whenever the space changes, including when a kept-alive route becomes visible again.
    const fit = () => {
      const avail = parent.clientWidth - 32;
      if (avail > 0) setZoom(Math.min(1, avail / ((widthMm * 96) / 25.4)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [widthMm]);
  return (
    <div ref={ref} className="print-fit" style={{ ["--fit" as string]: zoom }}>
      {children}
    </div>
  );
}

export function PrintBar({ back, formats, current, tip }: { back: string; formats: { id: string; label: string; href: string }[]; current: string; tip: string }) {
  return (
    <div className="print-hide sticky top-0 z-10 grid gap-3 border-b border-line bg-surface-raised px-4 py-3">
      <div className="flex items-center gap-2">
        <Link href={back} className="grid size-11 place-items-center rounded-md text-ink" aria-label="Back to posters">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <span className="text-label min-w-0 flex-1 truncate">Print kit</span>
        <button type="button" className="btn min-h-11 px-4 text-label" onClick={() => window.print()}>
          <Printer />
          <span className="sm:hidden">Print</span>
          <span className="hidden sm:inline">Print or save as PDF</span>
        </button>
      </div>
      <nav aria-label="Format" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-1.5">
          {formats.map((f) => (
            <li key={f.id}>
              <Link
                href={f.href}
                aria-current={f.id === current ? "page" : undefined}
                className={`text-label flex min-h-11 items-center whitespace-nowrap rounded-pill border px-3.5 ${f.id === current ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 text-ink"}`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-caption text-ink-muted">{tip}</p>
    </div>
  );
}
