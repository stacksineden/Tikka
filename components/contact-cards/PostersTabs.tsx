import Link from "next/link";

/** Cards & posters: the two tabs, business cards first. Links, so each tab has its own address. */
export function PostersTabs({ current }: { current: "posters" | "cards" }) {
  const tabs = [
    { id: "cards", href: "/app/posters/cards", label: "Business cards" },
    { id: "posters", href: "/app/posters", label: "Drop posters" },
  ] as const;
  return (
    <nav aria-label="Business cards and posters" className="flex gap-1 rounded-pill bg-surface-sunken p-1">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={`text-label flex min-h-11 flex-1 items-center justify-center rounded-pill px-4 ${t.id === current ? "bg-surface-raised text-ink shadow-raised" : "text-ink-muted"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
