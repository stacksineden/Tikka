// Where files live. The database stores a short path ("images/{user}/logo/{file}.webp"); the
// screens get a full address. The only place that knows about Supabase Storage's URLs, so moving
// a kind of file elsewhere later (say video to a video service) changes this file only.

export const BUCKETS = ["images", "videos"] as const;
export type Bucket = (typeof BUCKETS)[number];

function publicBase(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/`;
}

const STORED = /^(images|videos)\//;

/** For the database: a Storage address becomes its path; anything else (demo files) stays as it is. */
export function toStored(url: string | undefined | null): string | null {
  if (!url) return null;
  const base = publicBase();
  return url.startsWith(base) && STORED.test(url.slice(base.length)) ? url.slice(base.length) : url;
}

/** For the screens: a stored path becomes its public address; anything else stays as it is. */
export function fromStored(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  return STORED.test(path) ? publicBase() + path : path;
}

/** A photo pasted in as data instead of uploaded: never saved (it would bloat every page). */
export function isInline(url: string | undefined | null): boolean {
  return !!url && url.startsWith("data:");
}
