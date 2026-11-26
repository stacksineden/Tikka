import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListingSettings } from "@/components/settings/ListingSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getBusiness, isDbId } from "@/lib/data";
import { place } from "@/lib/format";
import { getListingState, getSpacePhotos } from "@/lib/listing-db";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your Tikka listing" };

// Settings → Your Tikka listing (docs/HOMEPAGE_PLAN.md): shown in Tikka's search or not, the map pin
// and photos of the space (supabase/migrations/20261214100000_listing_and_location.sql). Owners only.

async function Listing() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  if (!isDbId(b.id))
    return (
      <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4">
        <p className="text-body">The demo business isn&apos;t in Tikka&apos;s search. Real businesses set their listing here: shown in search, a map pin and photos of their space.</p>
      </section>
    );
  const [photos, state] = await Promise.all([getSpacePhotos(b.id), getListingState(b.id)]);
  if (!state) return <p className="text-body">That didn&apos;t load. Try again.</p>;
  return (
    <ListingSettings
      slug={b.slug}
      area={place(b.area, b.city)}
      goesToCustomers={b.workPlace === "home"}
      listed={state.listed}
      termsAt={state.termsAt}
      graceUntil={state.graceUntil}
      missing={state.missing}
      amenities={state.amenities}
      languages={state.languages}
      lat={b.lat}
      lng={b.lng}
      approx={b.locationApprox !== false}
      photos={photos}
    />
  );
}

export default function Page() {
  return (
    <SettingsPage title="Your Tikka listing">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <Listing />
      </Suspense>
    </SettingsPage>
  );
}
