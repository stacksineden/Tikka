import type { Metadata } from "next";
import { BizDrops, BizFaq, BizFeatures, BizFinal, BizHero, BizPricing, BizProblem, BizSteps } from "@/components/landing/ForBusinesses";
import { StudioStrip } from "@/components/landing/StudioAndSpark";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { getDropTiers } from "@/lib/data";
import { dbPlusPrice } from "@/lib/plus-db";

// "For businesses" (usetikka.com/business): the wording agreed in docs/BUSINESS_PAGE_COPY.md.
// usetikka.com itself is the customer search (docs/HOMEPAGE_PLAN.md).

const TITLE = "Tikka for businesses · Turn \"How much?\" into a paid booking";
const DESCRIPTION = "A free website people book from, deposits that stop no-shows, and knowing what you made each week. For hair, makeup, nails, lashes and photographers across Nigeria.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Tikka", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function ForBusinessesPage() {
  const [tiers, plusKobo] = await Promise.all([getDropTiers(), dbPlusPrice().catch(() => null)]);
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
        <BizSteps />
        <BizFeatures />
        <BizDrops />
        <BizPricing tiers={tiers} plusKobo={plusKobo} />
        <BizFaq tiers={tiers} plusKobo={plusKobo} />
        <StudioStrip />
        <BizFinal />
      </main>
      <SiteFooter />
    </>
  );
}
