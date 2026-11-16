import type { CSSProperties } from "react";
import { count } from "@/lib/format";
import { packCountLabel, packLines, type PackItem } from "@/lib/pack";
import type { Tier } from "@/lib/types";
import { Spark, TearArrow, Tick } from "./glyphs";

export interface PackContents {
  legendary: number;
  rare: number;
  thankYou: number;
}

const TIER_DOT: Record<Tier, string> = {
  legendary: "var(--rarity-legendary)",
  rare: "var(--rarity-rare)",
  thank_you: "var(--rarity-common)",
};

/**
 * The sealed wrapper. Tikka keeps the shape: the crimps, the tear strip, the notch and the shine.
 * With `items` (the claim page) it is the business's own: its colour, logo, name and place, and
 * what's inside the drop, so a visitor knows whose it is and why to open it before they tap
 * (design/BRAND.md). Without `items` it is the Tikka-branded wrapper with the business's seal.
 */
export function TikkaPack({
  businessName,
  initials,
  logoUrl,
  brandColor,
  onBrandColor,
  total,
  contents,
  opening = false,
  empty = false,
  onTear,
  as = "button",
  items,
  meta,
  verified = false,
  nudge = false,
}: {
  businessName: string;
  initials: string;
  /** The business's logo, shown in the seal instead of the initials. */
  logoUrl?: string;
  brandColor: string;
  onBrandColor: string;
  total: number;
  contents: PackContents;
  opening?: boolean;
  /** Sold out or ended: shown open and empty. */
  empty?: boolean;
  onTear?: () => void;
  as?: "button" | "div";
  /** The drop's rewards. Given, the wrapper is the business's own (see above). */
  items?: PackItem[];
  /** Under the name: "Beauty · Lekki, Lagos". */
  meta?: string;
  verified?: boolean;
  /** A small wiggle every few seconds until it's torn. */
  nudge?: boolean;
}) {
  const Tag = as;
  if (items) {
    const { lines, more } = packLines(items);
    return (
      <Tag
        className={`tk-pack tk-pack-biz${opening ? " is-opening" : ""}${empty ? " is-empty" : ""}${nudge && !opening && !empty ? " is-nudging" : ""}`}
        style={{ "--biz": brandColor, "--on-biz": onBrandColor } as CSSProperties}
        {...(as === "button"
          ? { type: "button" as const, onClick: onTear, "aria-label": `Tear open your Tikka from ${businessName}` }
          : { "aria-hidden": true })}
      >
        <span className="tk-pack-top">
          <span className="tk-crimp tk-crimp-top" />
          <span className="tk-tear">
            <TearArrow />
            TEAR HERE
          </span>
        </span>
        <span className="tk-pack-body">
          <span className="tk-foil" />
          <span className="tk-pack-in">
            <span className={`tk-seal${logoUrl ? " has-logo" : ""}`}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tk-seal-logo" src={logoUrl} alt="" width={64} height={64} />
              ) : (
                <span className="tk-seal-in">{initials}</span>
              )}
            </span>
            <span className="tk-pack-name">{businessName}</span>
            {(meta || verified) && (
              <span className="tk-pack-meta">
                {meta && <span>{meta}</span>}
                {verified && (
                  <span className="tk-pack-verified">
                    <Tick />
                    Verified
                  </span>
                )}
              </span>
            )}
            {empty ? (
              <span className="tk-pack-gone">No more Tikkas from {businessName} in this drop.</span>
            ) : (
              <span className="tk-pack-inside">
                <span className="tk-pack-inside-h">Inside this drop</span>
                {lines.map((it) => (
                  <span className="tk-pack-line" key={it.tier + it.reward}>
                    <i style={{ background: TIER_DOT[it.tier] }} />
                    <span>
                      <b>{it.reward}</b>
                      <small> · {packCountLabel(it, items)}</small>
                    </span>
                  </span>
                ))}
                {more > 0 && <span className="tk-pack-more">and {count(more)} more inside</span>}
              </span>
            )}
            <span className="tk-pack-stub">
              <span>{count(total)} Tikkas · limited</span>
              <span className="tk-pack-by">
                <Spark />
                Tikka
              </span>
            </span>
          </span>
          <span className="tk-crimp tk-crimp-bottom" />
        </span>
        <span className="tk-notch" />
      </Tag>
    );
  }
  return (
    <Tag
      className={`tk-pack${opening ? " is-opening" : ""}${empty ? " is-empty" : ""}`}
      style={{ "--biz": brandColor, "--on-biz": onBrandColor } as CSSProperties}
      {...(as === "button"
        ? { type: "button" as const, onClick: onTear, "aria-label": `Tear open your Tikka from ${businessName}` }
        : { "aria-hidden": true })}
    >
      <span className="tk-pack-top">
        <span className="tk-crimp tk-crimp-top" />
        <span className="tk-tear">
          <TearArrow />
          TEAR HERE
        </span>
      </span>
      <span className="tk-pack-body">
        <span className="tk-foil" />
        <Spark className="tk-pack-spark" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tk-pack-word" src="/brand/tikka-wordmark-reversed.svg" alt="" width={128} height={45} />
        <span className="tk-pack-sub">{empty ? `No more Tikkas from ${businessName} in this drop.` : `Something good from ${businessName} is sealed inside.`}</span>
        <span className={`tk-seal${logoUrl ? " has-logo" : ""}`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tk-seal-logo" src={logoUrl} alt="" width={62} height={62} />
          ) : (
            <span className="tk-seal-in">{initials}</span>
          )}
        </span>
        <span className="tk-limited">Limited drop · {count(total)} Tikkas</span>
        <span className="tk-odds">
          <span>
            <i style={{ background: "var(--rarity-legendary)" }} />
            {count(contents.legendary)} legendary
          </span>
          <span>
            <i style={{ background: "var(--rarity-rare)" }} />
            {count(contents.rare)} rare
          </span>
          <span>
            <i style={{ background: "var(--rarity-common)" }} />
            {count(contents.thankYou)} thank-you
          </span>
        </span>
        <span className="tk-crimp tk-crimp-bottom" />
      </span>
      <span className="tk-notch" />
    </Tag>
  );
}
