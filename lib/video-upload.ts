// Browser only: one owner video, wherever it goes. With Bunny Stream set up: straight to Bunny,
// then wait while it makes the small phone copy. Otherwise (or the demo business): Supabase
// Storage as before, which refuses HEVC because many Android phones can't play it. Bunny turns
// HEVC into H.264, so iPhone videos are fine there.

import { startVideoUploadAction, videoUploadStateAction } from "@/app/app/actions";
import { checkPlayable, uploadMedia, uploadToStream, waitForStream } from "./media-client";

export type VideoStage = { kind: "uploading"; done: number } | { kind: "processing" };

export async function sendVideo(file: File, kind: "card" | "portfolio", seconds: number, onStage?: (s: VideoStage) => void): Promise<string> {
  const start = await startVideoUploadAction({ kind, seconds, bytes: file.size });
  if (!start.ok && !start.fallback) throw new Error(start.error);
  onStage?.({ kind: "uploading", done: 0 });
  if (!start.ok) {
    await checkPlayable(file);
    return uploadMedia(file, "video");
  }
  await uploadToStream(file, start.pass, (done) => onStage?.({ kind: "uploading", done }));
  onStage?.({ kind: "processing" });
  return waitForStream(start.pass.guid, videoUploadStateAction);
}

/** "Uploading 40%" / "Getting it ready for phones…". */
export function stageLabel(s: VideoStage | undefined): string | undefined {
  if (!s) return undefined;
  return s.kind === "uploading" ? `Uploading ${Math.round(s.done * 100)}%` : "Getting it ready for phones… keep this screen open";
}
