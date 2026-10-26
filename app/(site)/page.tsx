import {
  ExampleResults,
  Faq,
  FinalCta,
  Hero,
  HowItWorks,
  LiveDrops,
  Outcomes,
  Pricing,
  ProblemLine,
  Tiers,
  WhoItsFor,
} from "@/components/landing/Sections";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { LiveStats } from "@/components/landing/LiveStats";
import { SparkSection, StudioStrip } from "@/components/landing/StudioAndSpark";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getDropPacks, getDropTiers, getMarketplaceDrops, getPlatformStats } from "@/lib/data";

const TITLE = "Tikka · Turn people who see your business into customers who walk in";
const DESCRIPTION =
  "Share a Tikka drop behind one link. People claim on WhatsApp, come in to use it, and you see every name, number and naira it brought in.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Tikka", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * Real numbers only (PRD B1): demo businesses never count, and each live block is hidden until
 * it passes its threshold. Streams in, since it's live data.
 */
async function LiveBand() {
  const stats = await getPlatformStats();
  return <LiveStats initial={stats} />;
}

/** "Live on Tikka now": real live drops only, from 6 up; the count matches the stats bar. */
async function LiveDropsNow() {
  const stats = await getPlatformStats();
  if (!stats.show.strip) return null;
  const drops = await getMarketplaceDrops({ includeDemo: false });
  return <LiveDrops drops={drops} liveCount={stats.dropsLive} now={new Date()} />;
}

export default async function LandingPage() {
  const [tiers, packs] = await Promise.all([getDropTiers(), getDropPacks()]);
  return (
    <>
      <div className="stage bg-night">
        <SiteHeader />
      </div>
      <main>
        <div className="stage bg-night">
          <Hero />
        </div>
        <ProblemLine />
        <Outcomes />
        <HowItWorks />
        <Tiers />
        <WhoItsFor />
        <ExampleResults tiers={tiers} />
        {/* Live on Tikka: the stats band and the strip, each only above its threshold. */}
        <Suspense fallback={null}>
          <div className="stage bg-night">
            <LiveBand />
          </div>
          <LiveDropsNow />
        </Suspense>
        <Pricing tiers={tiers} packs={packs} />
        <StudioStrip />
        <SparkSection />
        <Faq tiers={tiers} packs={packs} />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
