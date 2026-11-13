// Where files live. The database stores a short path ("images/{user}/logo/{file}.webp"); the
// screens get a full address. The only place that knows about Supabase Storage's URLs, so moving
// a kind of file elsewhere later (say video to a video service) changes this file only.

export const BUCKETS = ["images", "videos"] as const;
export type Bucket = (typeof BUCKETS)[number];

function publicBase(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/`;
}

const STORED = /^(images|videos)\//;

// Videos on Bunny Stream (lib/stream.ts) are stored as "stream/{guid}/play_480p.mp4". Server only:
// the address needs BUNNY_STREAM_CDN_HOST.
const STREAM = /^stream\/([0-9a-f-]{36}\/[A-Za-z0-9_.]+)$/;
function streamBase(): string | null {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return host ? `https://${host}/` : null;
}

/** For the database: a Storage or Bunny address becomes its path; anything else (demo files) stays as it is. */
export function toStored(url: string | undefined | null): string | null {
  if (!url) return null;
  const base = publicBase();
  if (url.startsWith(base) && STORED.test(url.slice(base.length))) return url.slice(base.length);
  const stream = streamBase();
  if (stream && url.startsWith(stream) && STREAM.test(`stream/${url.slice(stream.length)}`)) return `stream/${url.slice(stream.length)}`;
  return url;
}

/** For the screens: a stored path becomes its public address; anything else stays as it is. */
export function fromStored(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  if (STORED.test(path)) return publicBase() + path;
  const m = STREAM.exec(path);
  if (m) {
    const stream = streamBase();
    return stream ? stream + m[1] : undefined;
  }
  return path;
}

/** A photo pasted in as data instead of uploaded: never saved (it would bloat every page). */
export function isInline(url: string | undefined | null): boolean {
  return !!url && url.startsWith("data:");
}

// Phone copies. A photo uploaded with a smaller copy is named "{id}.s.webp"; its copy sits beside
// it as "{id}.s-sm.webp" (1000px on the long side). Older photos have no copy and no marker.
const WITH_SMALL = /\.s\.webp$/;
export const SMALL_SUFFIX = ".s-sm.webp";

/** The phone copy's address, or null for a photo uploaded before copies existed. */
export function smallOf(url: string | undefined | null): string | null {
  return url && WITH_SMALL.test(url) ? url.replace(WITH_SMALL, SMALL_SUFFIX) : null;
}

/**
 * A srcset offering the phone copy and the full photo. The widths are deliberately low (the copy
 * is 1000px and the full photo 1600px on the long side, whatever the shape), so a browser only
 * picks the copy when it's clearly enough. Undefined when there's no copy.
 */
export function photoSrcSet(url: string | undefined | null): string | undefined {
  const small = smallOf(url);
  return small ? `${small} 700w, ${url} 1400w` : undefined;
}
