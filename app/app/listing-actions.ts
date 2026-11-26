"use server";

// Your Tikka listing (Settings → Your Tikka listing): shown in Tikka's search or not, the map pin and
// photos of the space. Owners only; the database checks again (save_location(), save_space_photos()).

import { revalidatePath } from "next/cache";
import { getBusiness, isDbId } from "@/lib/data";
import { cleanExtras, cleanLanguages, type ListingMissing } from "@/lib/listing";
import { acceptListing, saveListingExtras, saveLocation, saveSpacePhotos, setListed, type SpacePhoto } from "@/lib/listing-db";
import { getOwnerUser } from "@/lib/session";

async function ownerBusiness() {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  return b && isDbId(b.id) ? b : null;
}

function refresh(slug: string) {
  revalidatePath("/app/settings/listing");
  revalidatePath(`/book/${slug}`);
  revalidatePath("/app");
}

export async function setListedAction(listed: boolean): Promise<{ ok: boolean }> {
  const b = await ownerBusiness();
  if (!b) return { ok: false };
  const ok = await setListed(b.id, !!listed);
  refresh(b.slug);
  return { ok };
}

export async function saveLocationAction(lat: number, lng: number): Promise<{ ok: boolean }> {
  const b = await ownerBusiness();
  if (!b || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false };
  const ok = await saveLocation(b.id, lat, lng);
  refresh(b.slug);
  return { ok };
}

export async function saveSpacePhotosAction(photos: SpacePhoto[]): Promise<{ ok: boolean }> {
  const b = await ownerBusiness();
  if (!b || !Array.isArray(photos)) return { ok: false };
  const clean = photos.filter((p) => typeof p?.url === "string").slice(0, 6).map((p) => ({ url: p.url, thumbUrl: typeof p.thumbUrl === "string" ? p.thumbUrl : undefined }));
  const ok = await saveSpacePhotos(b.id, clean);
  refresh(b.slug);
  return { ok };
}

/** "List me": the owner agrees to the listing terms (the database checks the photo and prices). */
export async function acceptListingAction(): Promise<{ ok: true } | { ok: false; missing?: ListingMissing[] }> {
  const b = await ownerBusiness();
  if (!b) return { ok: false };
  const r = await acceptListing(b.id);
  refresh(b.slug);
  if (r.kind === "listed") return { ok: true };
  return { ok: false, missing: r.kind === "missing" ? r.missing : undefined };
}

export async function saveListingExtrasAction(amenities: string[], languages: string[]): Promise<{ ok: boolean }> {
  const b = await ownerBusiness();
  if (!b) return { ok: false };
  const ok = await saveListingExtras(b.id, cleanExtras(amenities), cleanLanguages(languages));
  refresh(b.slug);
  return { ok };
}
