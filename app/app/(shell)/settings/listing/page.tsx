import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListingSettings } from "@/components/settings/ListingSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getBusiness, isDbId } from "@/lib/data";
import { place } from "@/lib/format";
import { getSpacePhotos } from "@/lib/listing-db";
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
  const photos = await getSpacePhotos(b.id);
  return (
    <ListingSettings
      slug={b.slug}
      area={place(b.area, b.city)}
      initial={{ listed: b.listed !== false, lat: b.lat, lng: b.lng, approx: b.locationApprox !== false, goesToCustomers: b.workPlace === "home", photos }}
    />
  );
}

export default function Page() {
  return (
    <SettingsPage title="Your Tikka listing" intro="How you show when customers search Tikka for a service near them. Your own website stays the same.">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <Listing />
      </Suspense>
    </SettingsPage>
  );
}
