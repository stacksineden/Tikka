// Blurred copies for photos uploaded before they existed (lib/blur.ts). New uploads make their own in
// the browser (lib/media-client.ts); this one-time pass makes "{name}-xs.webp" beside every .webp in
// the images bucket that has none: portfolio, hero, about, service and space photos only (never logos,
// team faces, phone copies or the copies themselves).
//
//   pnpm blur:copies            counts what's missing, changes nothing
//   pnpm blur:copies --write    makes and uploads them
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (from .env.local).

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (source .env.local).");
  process.exit(1);
}
const write = process.argv.includes("--write");
const sb = createClient(url, key, { auth: { persistSession: false } });
const bucket = sb.storage.from("images");

/** Every file path under a folder, depth first (Storage lists one folder at a time). */
async function walk(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) out.push(path);
      else out.push(...(await walk(path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

const all = await walk("");
const have = new Set(all);
// Only the photos pages show large ({user}/{kind}/{file}), as lib/media-client.ts does for new uploads.
const BLURRED = ["portfolio", "hero", "about", "service", "space"];
const needs = all.filter(
  (p) => BLURRED.includes(p.split("/")[1]) && p.endsWith(".webp") && !p.endsWith("-xs.webp") && !p.endsWith(".s-sm.webp") && !have.has(p.slice(0, -".webp".length) + "-xs.webp"),
);
console.log(`${all.length} files, ${needs.length} photos without a blurred copy.`);
if (!write) {
  console.log("Nothing changed. Run with --write to make them.");
  process.exit(0);
}

let made = 0;
for (const path of needs) {
  const { data, error } = await bucket.download(path);
  if (error || !data) {
    console.warn(`skip ${path}: ${error?.message ?? "no data"}`);
    continue;
  }
  const xs = await sharp(Buffer.from(await data.arrayBuffer())).resize({ width: 24 }).webp({ quality: 60 }).toBuffer();
  const { error: up } = await bucket.upload(path.slice(0, -".webp".length) + "-xs.webp", xs, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (up) console.warn(`skip ${path}: ${up.message}`);
  else made++;
}
console.log(`Made ${made} blurred copies.`);
