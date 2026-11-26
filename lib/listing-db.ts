import "server-only";

// Your Tikka listing (supabase/migrations/20261214100000_listing_and_location.sql): shown in Tikka's
// search or not, the map pin, and up to 6 photos of the space. Owners only for changes (the database
// checks); space photos are public, like the rest of the business page.

import { approxLocation } from "./geocode";
import { fromStored, toStored } from "./media-path";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export interface SpacePhoto {
  url: string;
  thumbUrl?: string;
}

/** The business's space photos, in order. */
export async function getSpacePhotos(businessId: string): Promise<SpacePhoto[]> {
  const sb = await createClient();
  const { data } = await sb.from("business_space_photos").select("image_path, thumb_path").eq("business_id", businessId).order("position");
  return ((data ?? []) as { image_path: string; thumb_path: string | null }[]).map((r) => ({ url: fromStored(r.image_path)!, thumbUrl: fromStored(r.thumb_path) }));
}

export async function saveSpacePhotos(businessId: string, photos: SpacePhoto[]): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.rpc("save_space_photos", {
    p_business: businessId,
    p_photos: photos.slice(0, 6).map((p) => ({ image_path: toStored(p.url), thumb_path: p.thumbUrl ? toStored(p.thumbUrl) : null })),
  });
  return !error;
}

export async function saveLocation(businessId: string, lat: number, lng: number): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.rpc("save_location", { p_business: businessId, p_lat: lat, p_lng: lng });
  return !error;
}

export async function setListed(businessId: string, listed: boolean): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.from("businesses").update({ listed }).eq("id", businessId);
  return !error;
}

/**
 * A starting pin for a business without one, from its public area, city and state. Never moves a pin
 * the owner placed, never throws: call it after a save, outside the owner's wait (after()).
 */
export async function ensureStartingPin(b: { id: string; area: string; city: string; state: string; lat?: number }): Promise<void> {
  if (b.lat != null) return;
  try {
    const pin = await approxLocation(b.area, b.city, b.state);
    if (pin) await adminClient().rpc("set_approx_location", { p_business: b.id, p_lat: pin.lat, p_lng: pin.lng });
  } catch {
    // A missing pin only keeps the business off the map until the owner places one.
  }
}
