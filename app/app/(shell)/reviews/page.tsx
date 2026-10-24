import type { Metadata } from "next";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportButton } from "@/components/reviews/ReportButton";
import { getBusiness, getBusinessReviews } from "@/lib/data";
import { count, shortDate } from "@/lib/format";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Reviews" };

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden="true" className={i <= n ? "fill-gold text-gold" : "text-line-strong"} />
      ))}
    </span>
  );
}

async function Reviews() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [b, reviews] = await Promise.all([getBusiness(user), getBusinessReviews(user.id, { ownerView: true })]);
  if (!b) redirect("/app/setup");

  return (
    <>
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-6">
        <div className="text-display-lg tabular-nums">{b.rating ? b.rating.toFixed(1) : "–"}</div>
        <div>
          <Stars n={Math.round(b.rating ?? 0)} size={20} />
          <p className="text-body mt-1 text-ink-muted">
            {b.reviewCount ? `${count(b.reviewCount)} ${b.reviewCount === 1 ? "review" : "reviews"} from people who used a Tikka` : reviews.length ? "No reviews on show" : "No reviews yet"}
          </p>
        </div>
      </section>

      <p className="text-caption px-1 text-ink-muted">
        Only people who redeemed a Tikka can review, once per visit. You can report a review, but not edit or delete it.
      </p>

      {reviews.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface-raised p-6">
          <p className="text-body-lg text-ink-muted">After someone uses their Tikka, Tikka asks them how it went. Their reviews show here and on your card.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body font-semibold">{r.name}</span>
                <Stars n={r.rating} />
              </div>
              {r.text && <p className="text-body mt-2">{r.text}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
                <span className="text-caption text-ink-muted">
                  Used a Tikka · {r.dropName} · {shortDate(r.at)}
                </span>
                {r.status === "hidden" ? (
                  <span className="text-caption font-semibold text-ink-muted">Hidden by Tikka after your report</span>
                ) : (
                  <ReportButton id={r.id} reported={r.status === "reported"} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <h1 className="text-heading">Reviews</h1>
      <Suspense fallback={<div className="h-64 rounded-card bg-surface-sunken" />}>
        <Reviews />
      </Suspense>
    </div>
  );
}
