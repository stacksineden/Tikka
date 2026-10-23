import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewForm } from "@/components/claim/ReviewForm";
import { getReviewPage } from "@/lib/data";
import { REVIEW_WINDOW_DAYS } from "@/lib/redeem";

// Review (PRD A4): only after the Tikka was used, within 30 days, once.

export const metadata: Metadata = { title: "Rate your visit", robots: { index: false, follow: false } };

async function Review({ params, searchParams }: PageProps<"/t/[token]/review">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const page = await getReviewPage(token);
  if (!page) notFound();
  const { business: b } = page;
  const rating = Number(sp.rating);

  const closed: Record<Exclude<typeof page.state, "open">, string> = {
    not_redeemed: `You can review ${b.name} once you've used your Tikka there.`,
    reviewed: `You've already reviewed this visit. Thanks for helping people find ${b.name}.`,
    closed: `Reviews close ${REVIEW_WINDOW_DAYS} days after your visit.`,
  };

  return (
    <div className="tk-page px-5 pb-10 pt-4">
      <div className="tk-top -mx-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={75} height={22} />
      </div>
      <div className="mt-6 flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-pill border-2 border-on-night text-[20px] font-extrabold" style={{ background: b.brandColor, color: b.onBrandColor }}>
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            b.initials
          )}
        </span>
        <div className="min-w-0">
          <h1 className="tk-h">How was {b.name}?</h1>
          <p className="tk-p mt-1">You used: {page.reward}</p>
        </div>
      </div>
      <div className="mt-8">
        {page.state === "open" ? (
          <ReviewForm token={token} businessName={b.name} shownAs={page.shownAs} initialRating={rating >= 1 && rating <= 5 ? rating : undefined} />
        ) : (
          <div className="tk-box">
            <p className="tk-about">{closed[page.state]}</p>
            <Link href={`/t/${token}`} className="tk-btn tk-btn-paper mt-5">
              See my Tikka
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/t/[token]/review">) {
  return (
    <Suspense fallback={<div className="tk-page" aria-busy="true" />}>
      <Review {...props} />
    </Suspense>
  );
}
