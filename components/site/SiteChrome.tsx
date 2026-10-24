import Image from "next/image";
import Link from "next/link";
import { Logo } from "./Logo";

const NAV = [
  { href: "/drops", label: "Browse drops" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#who-its-for", label: "Who it's for" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQs" },
];

/** Sits on the night stage at the top of the landing page. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
      <Link href="/" className="shrink-0" aria-label="Tikka home">
        <Image src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={96} height={28} priority />
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className="text-label rounded-md px-3 py-2 text-on-night-muted transition-colors hover:text-on-night"
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/sign-in" className="text-label rounded-md px-3 py-2.5 text-on-night hover:bg-night-raised">
          Sign in
        </Link>
        <Link href="/sign-up" className="btn btn-paper min-h-10 px-4 text-label">
          Start free
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="text-body mt-4 text-ink-muted">
            Your ticket to something good. Made in Nigeria for businesses that want to know who walked in.
          </p>
        </div>
        <div>
          <h2 className="text-label text-ink">For businesses</h2>
          <ul className="text-body mt-3 grid gap-2 text-ink-muted">
            <li><Link className="hover:text-ink" href="/sign-up">Start free</Link></li>
            <li><Link className="hover:text-ink" href="/sign-in">Sign in</Link></li>
            <li><Link className="hover:text-ink" href="/#pricing">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-label text-ink">Tikka</h2>
          <ul className="text-body mt-3 grid gap-2 text-ink-muted">
            <li><Link className="hover:text-ink" href="/drops">Browse drops</Link></li>
            <li><Link className="hover:text-ink" href="/#faq">FAQs</Link></li>
            <li><Link className="hover:text-ink" href="/privacy">Privacy policy</Link></li>
            <li><Link className="hover:text-ink" href="/terms">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="text-caption mx-auto max-w-6xl px-4 py-5 text-ink-muted sm:px-6">© 2026 Tikka. All Tikkas are free to claim.</p>
      </div>
    </footer>
  );
}
