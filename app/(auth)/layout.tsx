import { Logo } from "@/components/site/Logo";
import Link from "next/link";
import { HeroDemo } from "@/components/landing/HeroDemo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="self-start" aria-label="Tikka home">
          <Logo priority />
        </Link>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-caption text-center text-ink-muted">© 2026 Tikka</p>
      </div>

      {/* What Tikka does now, the same story as the For businesses hero: they ask the price, book a free time, pay the deposit, you see your week. */}
      <aside className="stage relative hidden overflow-hidden bg-night px-8 lg:flex lg:flex-col lg:items-center lg:justify-center">
        <HeroDemo />
        <p className="text-body-lg mt-10 max-w-[360px] text-center text-on-night-muted">
          <span className="text-on-night">From &ldquo;How much?&rdquo; to a paid booking.</span> Your bookings, deposits and customers in one place.
        </p>
      </aside>
    </div>
  );
}
