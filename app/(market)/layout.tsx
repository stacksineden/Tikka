import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteChrome";

// The public marketplace: light, fast, server-rendered (PRD A5).
export default function MarketLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-20 border-b border-night-raised bg-night" data-theme="light">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/drops" aria-label="Tikka drops" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={82} height={24} />
            <span className="rounded-pill bg-night-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-on-night-muted">Drops</span>
          </Link>
          <Link href="/" className="text-label rounded-md px-2 py-2.5 text-on-night">
            For businesses
          </Link>
        </div>
      </header>
      <main className="pb-14">{children}</main>
      <SiteFooter />
    </div>
  );
}
