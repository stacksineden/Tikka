import { Printer } from "lucide-react";
import Link from "next/link";
import { PosterFace, type PosterBusiness } from "@/components/posters/PosterFace";
import { clockTime, shortDate } from "@/lib/format";
import { DEFAULT_HOOK } from "@/lib/posters";
import { UseRewardOnPoster } from "./UseRewardOnPoster";

/**
 * After publishing: the business's permanent counter poster, not a QR for this one drop. It
 * already opens whatever drop is live, so a printed one needs nothing; the best reward can go on
 * it in one tap.
 */
export function PosterNudge({
  b,
  poster,
  qr,
  suggestion,
  opensAt,
}: {
  b: PosterBusiness;
  poster: { id: string; code: string; hookLine?: string };
  qr: string;
  /** This drop's best reward as a poster line, or null. */
  suggestion: string | null;
  /** Set when the drop is scheduled: the poster opens it from then. */
  opensAt?: string;
}) {
  const hook = poster.hookLine ?? DEFAULT_HOOK;
  // Side by side only when the box itself has room: in the narrow desktop column it stacks.
  return (
    <div className="@container">
      <div className="grid gap-4 rounded-card border border-line bg-surface-sunken p-4 @md:grid-cols-[auto_minmax(0,1fr)] @md:items-start">
        {/* A real preview of the A5 face, scaled down. */}
        <div className="mx-auto overflow-hidden rounded-md shadow-raised" style={{ width: "calc(148mm * 0.32)", height: "calc(210mm * 0.32)" }} aria-hidden="true">
          <div data-theme="light" style={{ zoom: 0.32 }}>
            <PosterFace b={b} code={poster.code} qr={qr} hook={hook} />
          </div>
        </div>
        <div className="grid content-start gap-3">
          <div>
            <h3 className="text-title text-[17px] leading-6">
              {opensAt ? `From ${shortDate(opensAt)}, ${clockTime(opensAt)}, your counter poster opens this drop` : "Your counter poster now opens this drop"}
            </h3>
            <p className="text-body mt-1 text-ink-muted">Already printed it? Nothing to do: it opens your live drop by itself, this one and every one after.</p>
          </div>
          <UseRewardOnPoster posterId={poster.id} suggestion={suggestion} current={hook} />
          <Link href={`/app/posters/${poster.id}/print?format=a4`} className="btn btn-lg w-full @md:w-auto @md:justify-self-start">
            <Printer />
            Print your poster
          </Link>
        </div>
      </div>
    </div>
  );
}
