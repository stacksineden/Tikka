import type { CSSProperties } from "react";

// While a screen's data streams in: a grid of soft boxes that pulse one after another, so people can
// see something is loading (never one big empty block). Opacity only; still with reduced motion.

const delay = (i: number): CSSProperties => ({ animationDelay: `${(i % 8) * 120}ms` });

function Box({ i, className }: { i: number; className: string }) {
  return <div className={`rounded-card bg-line motion-safe:animate-pulse ${className}`} style={delay(i)} />;
}

/**
 * A title, a row of tiles and a few list rows. `tiles` and `rows` set how many; `bare` drops the
 * title (for a section inside a page that already has one).
 */
export function LoadingGrid({ tiles = 4, rows = 3, bare = false, className = "" }: { tiles?: number; rows?: number; bare?: boolean; className?: string }) {
  let n = 0;
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={`grid gap-4 ${className}`}>
      <span className="sr-only">Loading…</span>
      {!bare && (
        <div className="grid gap-2">
          <Box i={n++} className="h-8 w-48 rounded-md" />
          <Box i={n++} className="h-4 w-72 max-w-full rounded-md" />
        </div>
      )}
      {tiles > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, () => (
            <Box key={n} i={n++} className="h-24" />
          ))}
        </div>
      )}
      {rows > 0 && (
        <div className="grid gap-2.5">
          {Array.from({ length: rows }, () => (
            <Box key={n} i={n++} className="h-16" />
          ))}
        </div>
      )}
    </div>
  );
}

/** A grid of cards (search results, photos): `count` boxes in two to three columns. */
export function LoadingCards({ count = 6, className = "" }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 ${className}`}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2">
          <Box i={i} className="aspect-[4/3]" />
          <Box i={i + 1} className="h-4 w-2/3 rounded-md" />
          <Box i={i + 2} className="h-4 w-1/2 rounded-md" />
        </div>
      ))}
    </div>
  );
}
