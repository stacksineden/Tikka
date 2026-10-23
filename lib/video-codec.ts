// Which codec a video file uses, read from the file itself (MP4 and MOV keep a four-letter code
// in the sample description). Most claimers watch on Android phones; many can't play HEVC
// ("High Efficiency" on iPhone), while H.264 plays everywhere.

export type VideoCodec = "h264" | "hevc" | "unknown";

const CODES: Record<string, VideoCodec> = { avc1: "h264", avc3: "h264", hvc1: "hevc", hev1: "hevc" };

/** Looks for the codec's four-letter code. The file's index can be at the start or the end, so all of it is searched. */
export function videoCodec(bytes: Uint8Array): VideoCodec {
  for (let i = 0; i + 4 <= bytes.length; i++) {
    // Cheap first-letter check before building a string: a, or h.
    const c = bytes[i];
    if (c !== 0x61 && c !== 0x68) continue;
    const code = String.fromCharCode(c, bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    if (code in CODES) return CODES[code];
  }
  return "unknown";
}

export const HEVC_PROBLEM =
  "This video won't play on many Android phones. On iPhone, go to Settings › Camera › Formats, choose Most Compatible, and record it again. Or send it to yourself on WhatsApp first and upload that copy.";
