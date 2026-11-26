import Link from "next/link";
import { Logo } from "@/components/site/Logo";

// The customer side's header (docs/HOMEPAGE_PLAN.md): Tikka, "For businesses" and, for owners, Sign in.
export function HomeHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Tikka home" className="shrink-0">
          <Logo priority />
        </Link>
        <span className="flex-1" />
        <Link href="/business" className="btn btn-secondary min-h-11 rounded-pill px-4">
          For businesses
        </Link>
        <Link href="/sign-in" className="text-label hidden min-h-11 items-center rounded-pill px-4 hover:bg-surface-sunken sm:inline-flex">
          Sign in
        </Link>
      </div>
    </header>
  );
}
