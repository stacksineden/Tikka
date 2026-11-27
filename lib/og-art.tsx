import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { count, place } from "./format";
import { packCountLabel, packLines } from "./pack";
import { TOKENS } from "./tokens";
import type { Business, PublicDrop } from "./types";

// Drop artwork for @vercel/og (TECH_PLAN §15): the link preview (1200×630), the WhatsApp
// status image (1080×1920) and the square post (1080×1080). One design, three layouts.

const SPARK = "M12 2c.6 4.6 2.4 7.6 10 10-7.6 2.4-9.4 5.4-10 10-.6-4.6-2.4-7.6-10-10 7.6-2.4 9.4-5.4 10-10z";

let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 500 | 800; style: "normal" }[]> | undefined;

/** Bricolage Grotesque from Google Fonts as TTF; falls back to the built-in font if offline. */
function loadFonts() {
  fonts ??= Promise.all(
    ([500, 800] as const).map(async (weight) => {
      const css = await fetch(`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}`).then((r) => r.text());
      const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
      if (!url) throw new Error("no ttf");
      return { name: "Bricolage", data: await fetch(url).then((r) => r.arrayBuffer()), weight, style: "normal" as const };
    }),
  ).catch(() => []);
  return fonts;
}

let wordmarkUri: Promise<string> | undefined;

/** The wordmark as a data URI: the image renderer won't fetch from our own host. */
function loadWordmark() {
  wordmarkUri ??= readFile(join(process.cwd(), "public/brand/tikka-wordmark-reversed.svg")).then(
    (svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`,
  );
  return wordmarkUri;
}

const mono = { fontFamily: "monospace", letterSpacing: 3, textTransform: "uppercase" as const };

/** A colour from a hex with some transparency: the image renderer has no color-mix(). */
function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const DOT = { legendary: TOKENS.rarityLegendary, rare: TOKENS.gold, thank_you: TOKENS.rarityCommon } as const;

/**
 * The sealed wrapper as the claim page shows it (components/tikka/TikkaPack.tsx, `items`): the
 * business's colour, seal, name and place, and what's inside the drop. Tikka keeps the shape,
 * the tear strip and the stub. Drawn at `s` × the link-preview size.
 */
function Wrapper({ b, drop, s }: { b: Business; drop: PublicDrop; s: number }) {
  const on = b.onBrandColor;
  const { lines, more } = packLines(drop.items);
  const meta = [b.category, place(b.area, b.city)].filter(Boolean).join(" · ");
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: 340 * s, height: 476 * s, flexShrink: 0, color: on }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          height: 58 * s,
          padding: `0 ${22 * s}px`,
          background: b.brandColor,
          borderRadius: `${26 * s}px ${26 * s}px 0 0`,
          borderBottom: `${3 * s}px dashed ${alpha(on, 0.6)}`,
          fontSize: 13 * s,
          fontWeight: 800,
          ...mono,
          letterSpacing: 3 * s,
        }}
      >
        ← Tear here
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
          padding: `${18 * s}px ${22 * s}px ${16 * s}px`,
          background: b.brandColor,
          borderRadius: `0 0 ${26 * s}px ${26 * s}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 76 * s,
            height: 76 * s,
            borderRadius: 76 * s,
            background: on,
            color: b.brandColor,
            fontSize: 26 * s,
            fontWeight: 800,
          }}
        >
          {b.initials}
        </div>
        <div style={{ display: "flex", marginTop: 10 * s, fontSize: 28 * s, fontWeight: 800, letterSpacing: -0.5 * s, textAlign: "center", lineHeight: 1.1 }}>{b.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * s, marginTop: 6 * s, fontSize: 14 * s, fontWeight: 500, color: alpha(on, 0.86) }}>
          {meta}
          {b.verified && (
            <div style={{ display: "flex", padding: `${2 * s}px ${9 * s}px`, borderRadius: 99 * s, background: alpha(on, 0.16), color: on, fontWeight: 800, alignItems: "center", gap: 4 * s }}>
              <svg width={11 * s} height={11 * s} viewBox="0 0 24 24">
                <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={on} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verified
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            marginTop: 14 * s,
            padding: `${12 * s}px ${14 * s}px`,
            gap: 8 * s,
            borderRadius: 14 * s,
            background: alpha(on, 0.12),
          }}
        >
          <div style={{ display: "flex", fontSize: 11 * s, fontWeight: 800, color: alpha(on, 0.8), ...mono, letterSpacing: 2 * s }}>Inside this drop</div>
          {lines.map((it) => (
            <div key={it.tier + it.reward} style={{ display: "flex", alignItems: "center", gap: 9 * s, fontSize: 16 * s, fontWeight: 800 }}>
              <div style={{ display: "flex", width: 10 * s, height: 10 * s, borderRadius: 10 * s, background: DOT[it.tier], flexShrink: 0 }} />
              <div style={{ display: "flex", flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{it.reward}</div>
              <div style={{ display: "flex", fontSize: 12 * s, fontWeight: 500, color: alpha(on, 0.8), flexShrink: 0 }}>{packCountLabel(it, drop.items)}</div>
            </div>
          ))}
          {more > 0 && <div style={{ display: "flex", paddingLeft: 19 * s, fontSize: 12 * s, color: alpha(on, 0.8) }}>and {count(more)} more inside</div>}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            marginTop: "auto",
            paddingTop: 10 * s,
            borderTop: `${1.5 * s}px dashed ${alpha(on, 0.4)}`,
            fontSize: 11 * s,
            fontWeight: 800,
            ...mono,
            letterSpacing: 2 * s,
          }}
        >
          <div style={{ display: "flex" }}>{count(drop.total)} Tikkas · limited</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 * s }}>
            <svg width={12 * s} height={12 * s} viewBox="0 0 24 24">
              <path d={SPARK} fill={TOKENS.gold} />
            </svg>
            Tikka
          </div>
        </div>
      </div>
    </div>
  );
}

export type Layout = "preview" | "status" | "square";
const SIZES: Record<Layout, { width: number; height: number }> = {
  preview: { width: 1200, height: 630 },
  status: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export async function dropImage(b: Business, drop: PublicDrop, layout: Layout, link: string, download?: string): Promise<ImageResponse> {
  const loadedFonts = await loadFonts();
  const label = drop.status === "scheduled" ? "Coming soon" : "Limited drop";
  const base = { width: "100%", height: "100%", display: "flex", background: TOKENS.night, color: TOKENS.onNight, fontFamily: "Bricolage" } as const;

  const art =
    layout === "preview" ? (
      <div style={{ ...base, alignItems: "center", padding: "0 90px", gap: 80 }}>
        <Wrapper b={b} drop={drop} s={1} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 20, color: TOKENS.gold, ...mono }}>{label}</div>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 18 }}>{b.name} has something for you</div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: TOKENS.onNightMuted, marginTop: 18 }}>
            {b.category} · {place(b.area, b.city)}
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, marginTop: 44 }}>Tear it open. Every Tikka holds something.</div>
        </div>
      </div>
    ) : (
      // Status and square: stacked and centred, with the link written out (images can't hold a tap).
      <div style={{ ...base, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: layout === "status" ? "120px 80px" : "70px 80px", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: layout === "status" ? 30 : 24, color: TOKENS.gold, ...mono }}>{label}</div>
        <div style={{ display: "flex", fontSize: layout === "status" ? 92 : 58, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, marginTop: 24, justifyContent: "center" }}>
          {b.name} has something for you
        </div>
        <div style={{ display: "flex", marginTop: layout === "status" ? 70 : 36 }}>
          <Wrapper b={b} drop={drop} s={layout === "status" ? 1.75 : 1.02} />
        </div>
        <div
          style={{
            display: "flex",
            marginTop: layout === "status" ? 80 : 34,
            padding: layout === "status" ? "26px 44px" : "18px 32px",
            borderRadius: 999,
            background: TOKENS.gold,
            color: TOKENS.night,
            fontSize: layout === "status" ? 40 : 30,
            fontWeight: 800,
          }}
        >
          {link}
        </div>
      </div>
    );

  return new ImageResponse(art, {
    ...SIZES[layout],
    fonts: loadedFonts,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      ...(download ? { "Content-Disposition": `attachment; filename="${download}"` } : {}),
    },
  });
}

/** What the card image shows: the card back, without the code (the image gets shared). */
export interface CardArt {
  tier: "legendary" | "rare" | "thank_you";
  reward: string;
  action?: string;
  serial: string;
  total: number;
  claimer: string;
  expiresAt: string;
  businessName: string;
  /** The business's code prefix: the code shows masked, "BB-•••••". */
  codePrefix: string;
  where: string;
  /** "usetikka.com/d/…" while the drop still has Tikkas, else undefined. */
  getYours?: string;
}

const TIER_COLOR = { legendary: TOKENS.rarityLegendary, rare: TOKENS.gold, thank_you: TOKENS.rarityCommon } as const;
const TIER_NAME = { legendary: "Legendary", rare: "Rare", thank_you: "Thank-you" } as const;
const PIPS = { thank_you: 1, rare: 2, legendary: 3 } as const;

/** The revealed card (1080×1350), for the WhatsApp card message and "Share my Tikka". */
export async function cardImage(c: CardArt): Promise<ImageResponse> {
  const [wordmark, loadedFonts] = await Promise.all([loadWordmark(), loadFonts()]);
  const rar = TIER_COLOR[c.tier];
  const s = 2;
  const got = c.tier === "thank_you" ? "Thank you for coming through" : "You got a Tikka!";
  const till = new Date(c.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

  const art = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: TOKENS.night, color: TOKENS.onNight, fontFamily: "Bricolage" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wordmark} width={146} height={51} alt="" />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: 280 * s, height: 392 * s, marginTop: 56, borderRadius: 18 * s, overflow: "hidden", background: TOKENS.nightRaised }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${18 * s}px ${18 * s}px 0` }}>
          <div style={{ display: "flex", alignSelf: "flex-start", alignItems: "center", gap: 6 * s, padding: `${4 * s}px ${10 * s}px`, borderRadius: 999, border: `${1.5 * s}px solid ${rar}`, color: rar, fontSize: 11 * s, ...mono, letterSpacing: 1.5 * s }}>
            {Array.from({ length: PIPS[c.tier] }, (_, i) => (
              <div key={i} style={{ width: 6 * s, height: 6 * s, borderRadius: 6 * s, background: rar }} />
            ))}
            {TIER_NAME[c.tier]}
          </div>
          <svg width={76 * s} height={76 * s} viewBox="0 0 24 24" style={{ margin: `${14 * s}px auto 0` }}>
            <path d={SPARK} fill={rar} />
          </svg>
          <div style={{ display: "flex", marginTop: "auto", fontSize: 25 * s, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>{got}</div>
          <div style={{ display: "flex", marginTop: 4 * s, fontSize: 12 * s, fontWeight: 500, color: TOKENS.onNightMuted }}>
            from {c.businessName} · {c.where}
          </div>
          <div style={{ display: "flex", marginTop: 10 * s, padding: `${10 * s}px 0 ${12 * s}px`, borderTop: `1px solid rgba(246,243,255,.18)`, fontSize: 10 * s, ...mono, letterSpacing: 1 * s }}>
            Issued to {c.claimer}
            {c.serial ? ` · No. ${c.serial} / ${count(c.total)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: 392 * s * 0.28, padding: `${14 * s}px ${18 * s}px`, background: rar, color: TOKENS.night }}>
          <div style={{ display: "flex", fontSize: 21 * s, fontWeight: 800, lineHeight: 1.14, letterSpacing: -0.8 }}>{c.reward}</div>
          {c.action && <div style={{ display: "flex", fontSize: 11.5 * s, fontWeight: 500, marginTop: 2 * s }}>{c.action}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 * s, fontSize: 13 * s, ...mono, letterSpacing: 1 * s }}>
            <span>{c.codePrefix}-•••••</span>
            <span>Till {till}</span>
          </div>
        </div>
      </div>
      {c.getYours ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 56 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TOKENS.onNightMuted }}>Every Tikka holds something. Get yours:</div>
          <div style={{ display: "flex", marginTop: 18, padding: "16px 32px", borderRadius: 999, background: TOKENS.gold, color: TOKENS.night, fontSize: 30, fontWeight: 800 }}>{c.getYours}</div>
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 64, fontSize: 30, fontWeight: 500, color: TOKENS.onNightMuted }}>Every Tikka holds something.</div>
      )}
    </div>
  );

  return new ImageResponse(art, {
    width: 1080,
    height: 1350,
    fonts: loadedFonts,
    // The card can change state (used, expired) but the image only shows what doesn't.
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}

/** Link preview for a Tikka Studio case study (1200×630): the client, what we did, and the cover. */
export async function studioCaseImage(c: { client: string; title: string; label: string; cover: string | null }): Promise<ImageResponse> {
  const [wordmark, loadedFonts] = await Promise.all([loadWordmark(), loadFonts()]);
  // A cover in public/ is read from disk (the renderer won't fetch from our own host); Cloudinary is fetched.
  let cover: string | null = null;
  if (c.cover?.startsWith("/")) {
    const file = await readFile(join(process.cwd(), "public", c.cover)).catch(() => null);
    cover = file ? `data:image/jpeg;base64,${file.toString("base64")}` : null;
  } else if (c.cover) {
    cover = c.cover.includes("/video/upload/")
      ? c.cover.replace("/video/upload/", "/video/upload/so_2,w_560,h_630,c_fill,f_jpg,q_auto/").replace(/\.\w+$/, ".jpg")
      : c.cover.replace("/image/upload/", "/image/upload/w_560,h_630,c_fill,g_north,f_jpg,q_auto/");
  }
  const art = (
    <div style={{ width: "100%", height: "100%", display: "flex", background: TOKENS.night, color: TOKENS.onNight, fontFamily: "Bricolage" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 70px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmark} width={120} height={42} alt="" />
          <div style={{ display: "flex", fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>Studio</div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: TOKENS.onNightMuted, marginTop: 44, ...mono }}>{c.label}</div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 14 }}>{c.client}</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TOKENS.onNightMuted, marginTop: 18 }}>{c.title}</div>
      </div>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} width={560} height={630} alt="" style={{ objectFit: "cover" }} />
      )}
    </div>
  );
  return new ImageResponse(art, { width: 1200, height: 630, fonts: loadedFonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}

/**
 * "We now take bookings" for a business to post on its WhatsApp status (1080×1920) or Instagram
 * (1080×1080): its own colour, best photo, name and link. Customer-facing, so it's the business's
 * own brand, with no Tikka explanation (only a small "Book on usetikka.com" in the link itself).
 */
export async function bookingImage(
  b: { name: string; brandColor: string; onBrandColor: string; category: string; area: string; city: string; slug: string },
  photo: string | undefined,
  layout: "status" | "square",
  download?: string,
): Promise<ImageResponse> {
  const loadedFonts = await loadFonts();
  const tall = layout === "status";
  const on = b.onBrandColor;
  const pic = photo ? await toPngData(photo) : null;
  const art = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: b.brandColor, color: on, fontFamily: "Bricolage", padding: tall ? "110px 80px" : "64px 72px" }}>
      <div style={{ display: "flex", fontSize: tall ? 34 : 26, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", color: alpha(on, 0.8) }}>Now taking bookings</div>
      <div style={{ display: "flex", fontSize: tall ? 104 : 72, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, marginTop: tall ? 24 : 14 }}>{b.name}</div>
      <div style={{ display: "flex", fontSize: tall ? 34 : 26, fontWeight: 500, marginTop: tall ? 18 : 10, color: alpha(on, 0.8) }}>
        {[b.category, place(b.area, b.city)].filter(Boolean).join(" · ")}
      </div>
      {pic ? (
        <div style={{ display: "flex", flex: 1, marginTop: tall ? 60 : 36, borderRadius: 36, overflow: "hidden", background: alpha(on, 0.12) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the image renderer draws plain <img> */}
          <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        // No photo yet: the words carry it, centred in the space.
        <div style={{ display: "flex", flex: 1 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 60 : 36 }}>
        <div style={{ display: "flex", fontSize: tall ? 40 : 30, fontWeight: 500 }}>See our prices and pick a free time</div>
        <div
          style={{
            display: "flex",
            marginTop: tall ? 26 : 16,
            alignSelf: "flex-start",
            padding: tall ? "24px 40px" : "16px 30px",
            borderRadius: 999,
            background: on,
            color: b.brandColor,
            fontSize: tall ? 44 : 32,
            fontWeight: 800,
          }}
        >
          usetikka.com/{b.slug}
        </div>
      </div>
    </div>
  );
  return new ImageResponse(art, {
    ...SIZES[layout],
    fonts: loadedFonts,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      ...(download ? { "Content-Disposition": `attachment; filename="${download}"` } : {}),
    },
  });
}

/** A photo as data the image renderer can draw (it fetches nothing itself and reads PNG and JPEG, not WebP). */
async function toPngData(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") ?? "";
    if (/png|jpe?g/.test(type)) return `data:${type};base64,${buf.toString("base64")}`;
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
