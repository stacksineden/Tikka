import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SparkContactForm, SparkJoin, SparkMark } from "@/components/spark/SparkTeaser";
import { getBusiness } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";
import { sparkState } from "@/lib/studio-db";

/** "Rather we do it for you?" (PRD B11): the way into Tikka Studio from the landing page. */
export function StudioStrip() {
  return (
    <section aria-labelledby="studio-strip-h" className="bg-surface px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-4 rounded-card border border-line bg-surface-raised px-5 py-6 sm:grid-cols-[1fr_auto] sm:px-8 sm:py-8">
        <div className="grid gap-1.5">
          <h2 id="studio-strip-h" className="text-heading">Rather we do it for you?</h2>
          <p className="text-body-lg max-w-2xl text-ink-muted">Tikka Studio builds websites, WhatsApp follow-up systems and ads, and runs your drops for you.</p>
        </div>
        <Link href="/studio" className="btn btn-lg btn-secondary justify-self-start">
          See Tikka Studio <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/** Signed in as an owner: one tap. Anyone else: an email or WhatsApp number. */
async function SparkSignup() {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business) return <SparkContactForm />;
  const s = await sparkState(business.id);
  return <SparkJoin onList={s.onList} canJoin />;
}

/** Spark (PRD B12): coming soon only. No input box for questions, no sample answers. */
export function SparkSection() {
  return (
    <section aria-labelledby="spark-h" className="bg-surface px-4 pb-12 sm:px-6 sm:pb-16">
      <div className="mx-auto grid max-w-6xl gap-4 rounded-card border border-dashed border-brand/40 bg-surface-raised px-5 py-6 sm:px-8 sm:py-8">
        <SparkMark />
        <h2 id="spark-h" className="text-heading">Meet Spark, your drop strategist.</h2>
        <p className="text-body-lg max-w-2xl text-ink-muted">
          Spark looks at your business and what&apos;s working for businesses like yours, then tells you what to offer, how many Tikkas to drop and where to share them.
        </p>
        <Suspense fallback={<SparkContactForm />}>
          <SparkSignup />
        </Suspense>
      </div>
    </section>
  );
}
