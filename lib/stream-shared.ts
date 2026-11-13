// Bunny Stream rules that don't need the API key, so they're tested on their own (lib/stream.ts
// does the calls). Videos are stored as "stream/{guid}/{file}"; lib/media-path.ts gives addresses.

/** The phone copy Tikka plays: small enough for mobile data, sharp enough on a phone. */
export const PLAY_HEIGHTS = [480, 360, 720, 240] as const;

/** One-time upload pass for the browser: sha256(library + key + expires + video), as Bunny checks it. */
export function uploadSignatureInput(libraryId: string, apiKey: string, expires: number, guid: string): string {
  return `${libraryId}${apiKey}${expires}${guid}`;
}

export type StreamState = { kind: "processing" } | { kind: "ready"; path: string } | { kind: "failed" };

/**
 * What a video's details from Bunny mean for Tikka. Ready once encoding has finished and the MP4
 * copies exist; then the 480p copy, or the nearest one there is (360p, 720p, 240p).
 * Bunny's video status: 0 created, 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error,
 * 6 upload failed.
 */
export function streamState(guid: string, v: { status?: number; hasMP4Fallback?: boolean; availableResolutions?: string | null }): StreamState {
  if (v.status === 5 || v.status === 6) return { kind: "failed" };
  if (v.status !== 4 || !v.hasMP4Fallback) return { kind: "processing" };
  const have = new Set((v.availableResolutions ?? "").split(",").map((r) => r.trim()));
  const height = PLAY_HEIGHTS.find((h) => have.has(`${h}p`));
  return height ? { kind: "ready", path: `stream/${guid}/play_${height}p.mp4` } : { kind: "failed" };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (s: unknown): s is string => typeof s === "string" && GUID.test(s);
