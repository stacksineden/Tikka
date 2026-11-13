import "server-only";

import { createHash } from "node:crypto";
import { adminClient } from "./supabase/admin";
import { isGuid, streamState, uploadSignatureInput, type StreamState } from "./stream-shared";

// Bunny Stream (TECH_PLAN §14): owners' card and portfolio videos. The API key stays here; the
// browser gets a one-time upload pass for one video and sends the file straight to Bunny, which
// shrinks it for phones. Off until BUNNY_STREAM_* are set (videos then go to Supabase Storage).

const API = "https://video.bunnycdn.com";
export const TUS_ENDPOINT = `${API}/tusupload`;

function env() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
  const apiKey = process.env.BUNNY_STREAM_API_KEY ?? "";
  const cdnHost = process.env.BUNNY_STREAM_CDN_HOST ?? "";
  return { libraryId, apiKey, cdnHost };
}

export function streamConfigured(): boolean {
  const e = env();
  return !!e.libraryId && !!e.apiKey && !!e.cdnHost;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { libraryId, apiKey } = env();
  return fetch(`${API}/library/${libraryId}${path}`, {
    ...init,
    headers: { AccessKey: apiKey, accept: "application/json", "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

export interface UploadPass {
  guid: string;
  libraryId: string;
  expires: number;
  signature: string;
  endpoint: string;
}

/** A new, empty video on Bunny for this person, and the pass to upload one file into it (for an hour). */
export async function createUpload(userId: string, title: string): Promise<UploadPass> {
  const res = await call("/videos", { method: "POST", body: JSON.stringify({ title }) });
  const v = (await res.json().catch(() => ({}))) as { guid?: string };
  if (!res.ok || !isGuid(v.guid)) throw new Error(`Bunny said ${res.status}`);
  const { error } = await adminClient().from("stream_videos").insert({ guid: v.guid, user_id: userId });
  if (error) {
    await deleteVideo(v.guid).catch(() => {});
    throw new Error(`stream_videos: ${error.message}`);
  }
  const { libraryId, apiKey } = env();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const signature = createHash("sha256").update(uploadSignatureInput(libraryId, apiKey, expires, v.guid)).digest("hex");
  return { guid: v.guid, libraryId, expires, signature, endpoint: TUS_ENDPOINT };
}

/** Whether this person's video is ready, and its stored path when it is. Null if it isn't theirs. */
export async function videoState(userId: string, guid: string): Promise<StreamState | null> {
  if (!isGuid(guid)) return null;
  const { data } = await adminClient().from("stream_videos").select("guid").eq("guid", guid).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const res = await call(`/videos/${guid}`);
  if (res.status === 404) return { kind: "failed" };
  if (!res.ok) return { kind: "processing" };
  return streamState(guid, (await res.json()) as Parameters<typeof streamState>[1]);
}

export async function deleteVideo(guid: string): Promise<boolean> {
  const res = await call(`/videos/${guid}`, { method: "DELETE" });
  return res.ok || res.status === 404;
}

/** The daily job: videos nothing points at (replaced, removed, never saved), a day after upload. */
export async function removeOrphanStreamVideos(): Promise<number> {
  if (!streamConfigured()) return 0;
  const admin = adminClient();
  const { data, error } = await admin.rpc("orphan_stream_videos", { p_limit: 100 });
  if (error) throw new Error(`orphan_stream_videos: ${error.message}`);
  let removed = 0;
  for (const { guid } of (data ?? []) as { guid: string }[]) {
    if (!(await deleteVideo(guid))) continue;
    await admin.from("stream_videos").delete().eq("guid", guid);
    removed++;
  }
  return removed;
}
