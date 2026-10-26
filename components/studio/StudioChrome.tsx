import { Menu, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import { STUDIO_EMAIL, studioWhatsAppLink } from "@/lib/studio";

const LINKS = [
  { href: "/studio/work", label: "Work" },
  { href: "/studio#services", label: "Services" },
  { href: "/studio#how-we-work", label: "How we work" },
  { href: "/studio/contact", label: "Contact" },
];

/** "Chat with us on WhatsApp": the Studio team's own number (PRD B11). Never WhatsApp green. */
export function StudioWhatsApp({ client, className = "btn", label = "Chat with us on WhatsApp" }: { client?: string; className?: string; label?: string }) {
  return (
    <a href={studioWhatsAppLink(client)} target="_blank" rel="noopener noreferrer" className={className}>
      <MessageCircle aria-hidden="true" />
      {label}
    </a>
  );
}

/** The Tikka logo (never redrawn or recoloured) followed by "Studio". */
function StudioMark() {
  return (
    <Link href="/studio" className="flex shrink-0 items-center gap-2" aria-label="Tikka Studio home">
      <Logo height={26} priority />
      <span className="text-[22px] font-bold leading-none tracking-[-0.02em] text-ink">Studio</span>
    </Link>
  );
}

export function StudioHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <StudioMark />
        <nav aria-label="Tikka Studio" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-label rounded-md px-3 py-2 text-ink-muted hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/" className="text-label hidden rounded-md px-3 py-2 text-ink-muted hover:text-ink sm:inline-flex">
            Try Tikka
          </Link>
          <StudioWhatsApp className="btn hidden min-h-11 px-4 text-label md:inline-flex" />
          {/* Phones: the links in a menu that needs no script. */}
          <details className="relative lg:hidden">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-md text-ink [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu size={22} aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-12 grid w-64 gap-1 rounded-card border border-line bg-surface-raised p-2 shadow-raised">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-body flex min-h-11 items-center rounded-md px-3 hover:bg-surface-sunken">
                  {l.label}
                </Link>
              ))}
              <Link href="/" className="text-body flex min-h-11 items-center rounded-md px-3 text-ink-muted hover:bg-surface-sunken">
                Try Tikka
              </Link>
              <StudioWhatsApp className="btn mt-1 min-h-11 w-full text-label" />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function StudioFooter() {
  return (
    <footer className="border-t border-line bg-surface-raised">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <StudioMark />
          <p className="text-body max-w-xs text-ink-muted">Tailor-made websites, WhatsApp systems, ads and drops, from the team behind Tikka.</p>
          <p className="text-body">
            <span className="text-ink-muted">Email </span>
            <span className="select-all font-medium">{STUDIO_EMAIL}</span>
          </p>
        </div>
        <div>
          <h2 className="text-label text-ink">Tikka Studio</h2>
          <ul className="text-body mt-3 grid gap-2 text-ink-muted">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link className="hover:text-ink" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-label text-ink">Tikka</h2>
          <ul className="text-body mt-3 grid gap-2 text-ink-muted">
            <li><Link className="hover:text-ink" href="/">Tikka</Link></li>
            <li><Link className="hover:text-ink" href="/drops">Marketplace</Link></li>
            <li><Link className="hover:text-ink" href="/privacy">Privacy</Link></li>
            <li><Link className="hover:text-ink" href="/terms">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="text-caption mx-auto max-w-6xl px-4 py-5 text-ink-muted sm:px-6">© 2026 Tikka. Tikka Studio is part of Tikka.</p>
      </div>
    </footer>
  );
}
