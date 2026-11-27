"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingGrid } from "@/components/ui/Loading";
import { PAGE_STYLES } from "@/lib/page";
import type { PageStyle } from "@/lib/types";

// Trying a page style on before applying it (Your page → Page style). The owner's real page, in
// that style, fills the screen: on a phone it's the phone page, on a laptop the computer page, with
// the real scrolling and animations. Nothing is saved until "Use this style".
// The page reads ?preview=<style> (app/(site)/[slug]/page.tsx); previews are never indexed.

export function StylePreview({
  slug,
  start,
  current,
  pending,
  onUse,
  onClose,
}: {
  slug: string;
  start: PageStyle;
  /** The style the page uses now. */
  current: PageStyle;
  pending: boolean;
  onUse: (style: PageStyle) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(() => Math.max(0, PAGE_STYLES.findIndex((s) => s.id === start)));
  const [loaded, setLoaded] = useState<string | null>(null);
  const style = PAGE_STYLES[i];
  const go = (by: number) => setI((n) => (n + by + PAGE_STYLES.length) % PAGE_STYLES.length);

  // The page behind stays still; Escape closes.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const inUse = style.id === current;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Preview of the ${style.name} style`} className="fixed inset-0 z-[60] flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface-raised px-2 pt-[env(safe-area-inset-top)] sm:px-4">
        <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-pill" aria-label="Close the preview">
          <X size={22} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => go(-1)} className="grid size-11 shrink-0 place-items-center rounded-pill" aria-label="Previous style">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 py-2 text-center">
          <b className="block truncate text-[16px]">{style.name}</b>
          <span className="text-caption block truncate text-ink-muted">
            {i + 1} of {PAGE_STYLES.length} · scroll to try it
          </span>
        </div>
        <button type="button" onClick={() => go(1)} className="grid size-11 shrink-0 place-items-center rounded-pill" aria-label="Next style">
          <ChevronRight size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={pending || inUse}
          onClick={() => onUse(style.id)}
          className="btn min-h-11 shrink-0 rounded-pill px-4 text-[15px] disabled:opacity-60"
        >
          {inUse ? "In use" : pending ? "Saving…" : <span>Use<span className="hidden sm:inline"> this style</span></span>}
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {loaded !== style.id && <LoadingGrid className="absolute inset-0 mx-auto max-w-3xl px-4 py-6" />}
        <iframe
          key={style.id}
          src={`/${slug}?preview=${style.id}`}
          title={`Your page in the ${style.name} style`}
          onLoad={() => setLoaded(style.id)}
          className={`size-full border-0 transition-opacity duration-300 ${loaded === style.id ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
