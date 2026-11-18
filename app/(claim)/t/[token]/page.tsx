import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClaimFlow } from "@/components/claim/ClaimFlow";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { claimProfile } from "@/lib/claim";
import { getBookingRules, getTikkaForBooking } from "@/lib/bookings-data";
import { whenLabel } from "@/lib/bookings";
import { getBusinessReviews, getCardPage } from "@/lib/data";
import { qrSvg } from "@/lib/qr";

// A claimer's card (PRD A2), linked from the WhatsApp message. The token is the only key:
// it shows this one card and nothing about any other claimer.

export const metadata: Metadata = { title: "Your Tikka", robots: { index: false, follow: false } };

async function Card({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  const page = await getCardPage(token);
  if (!page) notFound();
  const [reviews, rules] = await Promise.all([getBusinessReviews(page.ownerId), getBookingRules(page.ownerId, page.business)]);
  // Bookings on: "Book a time to use it" (or the booking it already has). Unused, unexpired Tikkas only.
  const tikka = rules ? await getTikkaForBooking(token, page.ownerId, page.business) : null;
  return (
    <ClaimFlow
      view="card"
      firstVisit={page.firstVisit}
      businessSlug={page.businessSlug}
      face={faceFromBusiness(page.business)}
      profile={claimProfile(page.business)}
      reviews={reviews.slice(0, 3).map((r) => ({ name: r.name, text: r.text, rating: r.rating }))}
      drop={page.drop}
      source="wa"
      claimed={{ card: page.card, status: page.status, qr: await qrSvg(page.card.code) }}
      booking={tikka ? { booked: tikka.booking ? { when: whenLabel(tikka.booking.startsAt), token: tikka.booking.token } : undefined } : undefined}
    />
  );
}

export default function Page(props: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={<div className="tk-page" aria-busy="true" />}>
      <Card {...props} />
    </Suspense>
  );
}
