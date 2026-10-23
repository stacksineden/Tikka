import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClaimFlow } from "@/components/claim/ClaimFlow";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { claimCookie, claimProfile, parseSource, VISITOR_COOKIE } from "@/lib/claim";
import { getBrowserClaim, getBusinessBySlug, getBusinessReviews, getPublicDrop, posterOf, recordEvent } from "@/lib/data";
import { count, place } from "@/lib/format";
import { qrSvg } from "@/lib/qr";

// The claim page (PRD A1). Server-rendered: the sealed wrapper is in the first HTML, before
// any JavaScript runs. The client only drives the beats (components/claim/ClaimFlow.tsx).

export async function generateMetadata({ params }: PageProps<"/d/[business]/[drop]">): Promise<Metadata> {
  const { business, drop } = await params;
  const found = await getPublicDrop(business, drop);
  if (!found) return { title: "Drop not found" };
  const { business: b, drop: d } = found;
  const title = `A Tikka from ${b.name}`;
  const parts = [
    d.contents.legendary && `${count(d.contents.legendary)} legendary`,
    d.contents.rare && `${count(d.contents.rare)} rare`,
    d.contents.thankYou && `${count(d.contents.thankYou)} thank-you`,
  ].filter(Boolean);
  const description = `${b.name} in ${place(b.area, b.city)} has a limited drop of ${count(d.total)} Tikkas: ${parts.join(", ")}. Tear it open and see what you get.`;
  const image = `/api/og/drop?b=${encodeURIComponent(business)}&d=${encodeURIComponent(drop)}`;
  return {
    title: { absolute: `${title} · Tikka` },
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1200, height: 630, alt: `A sealed Tikka from ${b.name}` }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: { index: false },
  };
}

async function Claim({ params, searchParams }: PageProps<"/d/[business]/[drop]">) {
  const [{ business: businessSlug, drop: dropSlug }, query, jar] = await Promise.all([params, searchParams, cookies()]);
  const found = await getPublicDrop(businessSlug, dropSlug);
  if (!found) notFound();
  const { business: b, drop } = found;

  const source = parseSource(query.c);
  const visitorId = jar.get(VISITOR_COOKIE)?.value;
  // QR visits from a poster: kept only if it's this business's poster.
  const posterId = source === "qr" ? await posterOf(businessSlug, typeof query.p === "string" ? query.p : undefined) : undefined;
  if (visitorId) await recordEvent(drop.id, "view", source, visitorId, posterId);

  const owner = await getBusinessBySlug(businessSlug);
  const [reviews, card] = await Promise.all([
    owner ? getBusinessReviews(owner.ownerId) : [],
    getBrowserClaim(drop.id, jar.get(claimCookie(drop.id))?.value, visitorId),
  ]);

  return (
    <ClaimFlow
      businessSlug={businessSlug}
      face={faceFromBusiness(b)}
      profile={claimProfile(b)}
      reviews={reviews.slice(0, 3).map((r) => ({ name: r.name, text: r.text, rating: r.rating }))}
      drop={drop}
      source={source}
      posterId={posterId}
      claimed={card ? { ...card, qr: await qrSvg(card.card.code) } : undefined}
    />
  );
}

export default function Page(props: PageProps<"/d/[business]/[drop]">) {
  return (
    <Suspense fallback={<div className="tk-page" aria-busy="true" />}>
      <Claim {...props} />
    </Suspense>
  );
}
