import type { Metadata } from "next";
import { BizDrops, BizFaq, BizFeatures, BizFinal, BizHero, BizPricing, BizProblem } from "@/components/landing/ForBusinesses";
import { StudioStrip } from "@/components/landing/StudioAndSpark";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { getDropPacks, getDropTiers } from "@/lib/data";

// "For businesses" (usetikka.com/business): the wording agreed in docs/BUSINESS_PAGE_COPY.md.
// usetikka.com itself is the customer search (docs/HOMEPAGE_PLAN.md).

const TITLE = "Tikka for businesses · Your posts get views. Tikka turns them into bookings.";
const DESCRIPTION = "A free website people book from, deposits that stop no-shows, and knowing what you made each week. For hair, makeup, nails, lashes and photographers across Nigeria.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Tikka", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function ForBusinessesPage() {
  const [tiers, packs] = await Promise.all([getDropTiers(), getDropPacks()]);
  return (
    <>
      <div className="stage bg-night">
        <SiteHeader />
      </div>
      <main className="overflow-x-clip">
        <div className="stage bg-night">
          <BizHero />
        </div>
        <BizProblem />
        <BizFeatures />
        <BizDrops />
        <BizPricing tiers={tiers} packs={packs} />
        <BizFaq tiers={tiers} />
        <StudioStrip />
        <BizFinal />
      </main>
      <SiteFooter />
    </>
  );
}
