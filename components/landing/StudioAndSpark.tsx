import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** "Rather we do it for you?" (PRD B11): the way into Tikka Studio from the landing page. */
export function StudioStrip() {
  return (
    <section aria-labelledby="studio-strip-h" className="bg-surface px-5 py-12 sm:px-6 sm:py-16">
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
