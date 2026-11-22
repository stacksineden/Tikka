import { describe, expect, it } from "vitest";
import { apertureText, cameraChips, cameraName, isoText, parseExif, shutterText, toneHex } from "./photo-meta";

/** A minimal JPEG with an EXIF block: Make, Model, and an EXIF IFD with exposure, f-number, ISO and lens. */
function jpegWithExif(le: boolean): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  // TIFF, offsets from its start.
  const make = ascii("Canon"), model = ascii("Canon EOS R5"), lens = ascii("RF85mm F1.2 L USM");
  const ifd0At = 8, ifd0Size = 2 + 3 * 12 + 4;
  const exifAt = ifd0At + ifd0Size, exifSize = 2 + 4 * 12 + 4;
  let data = exifAt + exifSize;
  const makeAt = data; data += make.length;
  const modelAt = data; data += model.length;
  const lensAt = data; data += lens.length;
  const expAt = data; data += 8;
  const fAt = data; data += 8;
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value];
  const tiff = [
    ...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At),
    ...u16(3),
    ...entry(0x010f, 2, make.length, u32(makeAt)),
    ...entry(0x0110, 2, model.length, u32(modelAt)),
    ...entry(0x8769, 4, 1, u32(exifAt)),
    ...u32(0),
    ...u16(4),
    ...entry(0x829a, 5, 1, u32(expAt)),
    ...entry(0x829d, 5, 1, u32(fAt)),
    ...entry(0x8827, 3, 1, [...u16(100), 0, 0]),
    ...entry(0xa434, 2, lens.length, u32(lensAt)),
    ...u32(0),
    ...make, ...model, ...lens,
    ...u32(1), ...u32(200),
    ...u32(18), ...u32(10),
  ];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  bytes.push(0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2);
  return new Uint8Array(bytes).buffer;
}

describe("parseExif", () => {
  it.each([true, false])("reads camera settings (little-endian %s)", (le) => {
    expect(parseExif(jpegWithExif(le))).toEqual({ camera: "Canon EOS R5", lens: "RF85mm F1.2 L USM", aperture: "f/1.8", shutter: "1/200s", iso: "ISO 100" });
  });
  it("returns nothing for files without EXIF or that aren't JPEGs", () => {
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined();
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeUndefined();
    expect(parseExif(new ArrayBuffer(0))).toBeUndefined();
  });
  it("never throws on a cut-off file", () => {
    const full = new Uint8Array(jpegWithExif(true));
    for (let n = 0; n < full.length; n += 7) expect(() => parseExif(full.slice(0, n).buffer)).not.toThrow();
  });
});

describe("formatting", () => {
  it("names the camera without repeating the maker", () => {
    expect(cameraName("Canon", "Canon EOS R5")).toBe("Canon EOS R5");
    expect(cameraName("NIKON CORPORATION", "NIKON Z 8")).toBe("NIKON Z 8");
    expect(cameraName("SONY", "ILCE-7M4")).toBe("SONY ILCE-7M4");
    expect(cameraName("Apple", undefined)).toBe("Apple");
    expect(cameraName(undefined, undefined)).toBeUndefined();
  });
  it("writes aperture, shutter and ISO the way photographers do", () => {
    expect(apertureText(1.8)).toBe("f/1.8");
    expect(apertureText(4)).toBe("f/4");
    expect(apertureText(0)).toBeUndefined();
    expect(shutterText(0.005)).toBe("1/200s");
    expect(shutterText(1 / 30)).toBe("1/30s");
    expect(shutterText(0.4)).toBe("1/2.5s");
    expect(shutterText(2)).toBe("2s");
    expect(isoText(800)).toBe("ISO 800");
    expect(isoText(undefined)).toBeUndefined();
  });
  it("makes a colour and the chips", () => {
    expect(toneHex(185, 138, 78)).toBe("#b98a4e");
    expect(toneHex(-4, 300, 0)).toBe("#00ff00");
    expect(cameraChips({ camera: "Canon EOS R5", iso: "ISO 100" })).toEqual(["Canon EOS R5", "ISO 100"]);
    expect(cameraChips(undefined)).toEqual([]);
  });
});
