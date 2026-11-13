import type { CSSProperties } from "react";
import { count } from "@/lib/format";
import { Spark, TearArrow } from "./glyphs";

export interface PackContents {
  legendary: number;
  rare: number;
  thankYou: number;
}

/** The sealed wrapper. It never changes between businesses except the seal: their logo, or their initials. */
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
}) {
  const Tag = as;
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
