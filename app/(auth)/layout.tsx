import { Logo } from "@/components/site/Logo";
import Link from "next/link";
import { SoloCard } from "@/components/tikka/SoloCard";

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

      <aside className="stage relative hidden overflow-hidden bg-night lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="-rotate-6">
          <SoloCard
            zoom={1.05}
            face={{
              name: "Glow Studio",
              initials: "GS",
              category: "Skin & beauty studio",
              area: "Lekki",
              city: "Lagos",
              brandColor: "#9C3B5C",
              onBrandColor: "#FFFFFF",
              verified: true,
              rating: 4.8,
              reviewCount: 126,
              tagline: "Facials, peels and glow-ups since 2019.",
            }}
            total={600}
            finish="holo"
            label="A Glow Studio Tikka"
          />
        </div>
        <p className="text-body-lg mt-12 max-w-[340px] text-center text-on-night-muted">
          <span className="text-on-night">577 of 600 claimed.</span> Every one of them is a name you can follow up.
        </p>
      </aside>
    </div>
  );
}
