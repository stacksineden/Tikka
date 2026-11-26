"use server";

// Your Tikka listing (Settings → Your Tikka listing): shown in Tikka's search or not, the map pin and
// photos of the space. Owners only; the database checks again (save_location(), save_space_photos()).

import { revalidatePath } from "next/cache";
import { getBusiness, isDbId } from "@/lib/data";
import { saveLocation, saveSpacePhotos, setListed, type SpacePhoto } from "@/lib/listing-db";
import { getOwnerUser } from "@/lib/session";

async function ownerBusiness() {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  return b && isDbId(b.id) ? b : null;
}

function refresh(slug: string) {
  revalidatePath("/app/settings/listing");
  revalidatePath(`/book/${slug}`);
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
