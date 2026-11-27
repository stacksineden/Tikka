import Link from "next/link";
import { Logo } from "@/components/site/Logo";

// The customer side's header (docs/HOMEPAGE_PLAN.md): Tikka, Drops (offers near you) and "For
// businesses". Signing in is for businesses, so it lives on the For businesses page, not here.
export function HomeHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Tikka home" className="shrink-0">
          <Logo priority />
        </Link>
        <span className="flex-1" />
        <Link href="/drops" className="text-label inline-flex min-h-11 items-center rounded-pill px-3 hover:bg-surface-sunken sm:px-4">
          Drops
        </Link>
        <Link href="/business" className="btn btn-secondary min-h-11 rounded-pill px-4">
          For businesses
        </Link>
      </div>
    </header>
  );
}
