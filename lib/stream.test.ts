import { afterEach, describe, expect, it, vi } from "vitest";
import { fromStored, toStored } from "./media-path";
import { isGuid, streamState, uploadSignatureInput } from "./stream-shared";

const G = "c2ff311d-797a-4c77-a9c9-67274c3e9d96";

describe("Bunny Stream", () => {
  it("is ready once encoding and the MP4 copies are done, playing 480p or the nearest", () => {
    expect(streamState(G, { status: 3, hasMP4Fallback: false })).toEqual({ kind: "processing" });
    expect(streamState(G, { status: 4, hasMP4Fallback: false, availableResolutions: "480p" })).toEqual({ kind: "processing" });
    expect(streamState(G, { status: 4, hasMP4Fallback: true, availableResolutions: "480p,720p,240p,360p" })).toEqual({ kind: "ready", path: `stream/${G}/play_480p.mp4` });
    expect(streamState(G, { status: 4, hasMP4Fallback: true, availableResolutions: "240p,360p" })).toEqual({ kind: "ready", path: `stream/${G}/play_360p.mp4` });
    expect(streamState(G, { status: 4, hasMP4Fallback: true, availableResolutions: "" })).toEqual({ kind: "failed" });
    expect(streamState(G, { status: 5 })).toEqual({ kind: "failed" });
    expect(streamState(G, { status: 6 })).toEqual({ kind: "failed" });
  });

  it("signs the upload pass as Bunny checks it", () => {
    expect(uploadSignatureInput("808106", "key", 1700000000, G)).toBe(`808106key1700000000${G}`);
    expect(isGuid(G)).toBe(true);
    expect(isGuid("../etc")).toBe(false);
  });
});

describe("stored video paths", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a Bunny address", () => {
    vi.stubEnv("BUNNY_STREAM_CDN_HOST", "vz-test.b-cdn.net");
    const url = `https://vz-test.b-cdn.net/${G}/play_480p.mp4`;
    expect(toStored(url)).toBe(`stream/${G}/play_480p.mp4`);
    expect(fromStored(`stream/${G}/play_480p.mp4`)).toBe(url);
  });

  it("leaves other addresses alone, and gives nothing without the host", () => {
    vi.stubEnv("BUNNY_STREAM_CDN_HOST", "vz-test.b-cdn.net");
    expect(toStored("https://vz-other.b-cdn.net/x/play_480p.mp4")).toBe("https://vz-other.b-cdn.net/x/play_480p.mp4");
    expect(fromStored("stream/not-a-guid/../x")).toBe("stream/not-a-guid/../x");
    vi.stubEnv("BUNNY_STREAM_CDN_HOST", "");
    expect(fromStored(`stream/${G}/play_480p.mp4`)).toBeUndefined();
  });
});
