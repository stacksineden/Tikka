/** Marks a sample card or result on the landing page, so no one takes it for a real business. */
export function ExampleTag({ onNight = false, className = "" }: { onNight?: boolean; className?: string }) {
  return (
    <span
      className={`tag font-mono uppercase tracking-[0.12em] ${onNight ? "bg-night-raised text-on-night-muted" : "bg-surface-sunken text-ink-muted"} ${className}`}
    >
      Example
    </span>
  );
}
