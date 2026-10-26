import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { count, place } from "./format";
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

/** The sealed wrapper with the business seal, drawn at `s` × the link-preview size. */
function Wrapper({ b, drop, wordmark, s }: { b: Business; drop: PublicDrop; wordmark: string; s: number }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: 340 * s, height: 476 * s, flexShrink: 0 }}>
      <div style={{ display: "flex", height: 66 * s, background: TOKENS.brand, borderRadius: `${26 * s}px ${26 * s}px 0 0`, borderBottom: `${3 * s}px dashed ${TOKENS.onNight}` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", flex: 1, background: TOKENS.brand, borderRadius: `0 0 ${26 * s}px ${26 * s}px` }}>
        <svg width={118 * s} height={118 * s} viewBox="0 0 24 24" style={{ marginTop: 26 * s }}>
          <path d={SPARK} fill={TOKENS.gold} />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wordmark} width={146 * s} height={51 * s} alt="" style={{ marginTop: 22 * s }} />
        <div style={{ display: "flex", marginTop: "auto", marginBottom: 34 * s, fontSize: 15 * s, color: TOKENS.onNightMuted, ...mono }}>
          Limited drop · {count(drop.total)} Tikkas
        </div>
        <div
          style={{
            position: "absolute",
            right: 16 * s,
            top: 40 * s,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 84 * s,
            height: 84 * s,
            borderRadius: 84 * s,
            background: b.brandColor,
            color: b.onBrandColor,
            border: `${4 * s}px solid ${TOKENS.onNight}`,
            fontSize: 28 * s,
            fontWeight: 800,
            transform: "rotate(-10deg)",
          }}
        >
          {b.initials}
        </div>
      </div>
    </div>
  );
}

function Contents({ drop, size, center = false }: { drop: PublicDrop; size: number; center?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start", gap: size * 1.4, fontSize: size, ...mono }}>
      {(
        [
          [drop.contents.legendary, "legendary", TOKENS.rarityLegendary],
          [drop.contents.rare, "rare", TOKENS.gold],
          [drop.contents.thankYou, "thank-you", TOKENS.rarityCommon],
        ] as const
      )
        .filter(([n]) => n > 0)
        .map(([n, label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: size * 0.55 }}>
            <div style={{ width: size * 0.8, height: size * 0.8, borderRadius: size, background: color }} />
            {count(n)} {label}
          </div>
        ))}
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
  const [wordmark, loadedFonts] = await Promise.all([loadWordmark(), loadFonts()]);
  const label = drop.status === "scheduled" ? "Coming soon" : "Limited drop";
  const base = { width: "100%", height: "100%", display: "flex", background: TOKENS.night, color: TOKENS.onNight, fontFamily: "Bricolage" } as const;

  const art =
    layout === "preview" ? (
      <div style={{ ...base, alignItems: "center", padding: "0 90px", gap: 80 }}>
        <Wrapper b={b} drop={drop} wordmark={wordmark} s={1} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 20, color: TOKENS.gold, ...mono }}>{label}</div>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 18 }}>A Tikka from {b.name}</div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: TOKENS.onNightMuted, marginTop: 18 }}>
            {b.category} · {place(b.area, b.city)}
          </div>
          <div style={{ display: "flex", marginTop: 40 }}>
            <Contents drop={drop} size={18} />
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, marginTop: 40 }}>Tear it open. Every Tikka holds something.</div>
        </div>
      </div>
    ) : (
      // Status and square: stacked and centred, with the link written out (images can't hold a tap).
      <div style={{ ...base, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: layout === "status" ? "120px 80px" : "70px 80px", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: layout === "status" ? 30 : 24, color: TOKENS.gold, ...mono }}>{label}</div>
        <div style={{ display: "flex", fontSize: layout === "status" ? 92 : 64, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, marginTop: 24, justifyContent: "center" }}>
          A Tikka from {b.name}
        </div>
        <div style={{ display: "flex", marginTop: layout === "status" ? 70 : 36 }}>
          <Wrapper b={b} drop={drop} wordmark={wordmark} s={layout === "status" ? 1.75 : 1.02} />
        </div>
        <div style={{ display: "flex", marginTop: layout === "status" ? 70 : 34 }}>
          <Contents drop={drop} size={layout === "status" ? 28 : 20} center />
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
