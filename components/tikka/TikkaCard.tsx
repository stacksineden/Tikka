import type { CSSProperties } from "react";
import { place } from "@/lib/format";
import type { Business, CardBackground, Finish, Tier } from "@/lib/types";
import { Spark, Star, Tick } from "./glyphs";
import { RarityBadge, TIER_VAR } from "./RarityBadge";
import "./tikka.css";

export interface CardFace {
  name: string;
  initials: string;
  category: string;
  area: string;
  city: string;
  brandColor: string;
  onBrandColor: string;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  tagline?: string;
  logoUrl?: string;
  background?: CardBackground;
}

export function faceFromBusiness(b: Business): CardFace {
  return {
    name: b.name,
    initials: b.initials,
    category: b.category,
    area: b.area,
    city: b.city,
    brandColor: b.brandColor,
    onBrandColor: b.onBrandColor,
    verified: b.verified,
    rating: b.rating,
    reviewCount: b.reviewCount,
    tagline: b.tagline,
    logoUrl: b.logoUrl,
    background: b.background,
  };
}

export interface CardReveal {
  tier: Tier;
  reward: string;
  code: string;
  expiry: string;
  serial: string;
  claimer: string;
  /** Action cards: what to do, e.g. "Follow @glowstudio on Instagram and show it at the counter". */
  instruction?: string;
}

export function bizStyle(face: Pick<CardFace, "brandColor" | "onBrandColor">): CSSProperties {
  return { "--biz": face.brandColor, "--on-biz": face.onBrandColor } as CSSProperties;
}

/** The Tikka ticket: business face on the front, what they got on the back. Stateless;
 *  the parent drives motion with classes (tk-rising, is-charging, is-flipped, is-revealed). */
export function TikkaCard({
  face,
  total,
  finish = "matte",
  claimedBy,
  reveal,
  className = "",
}: {
  face: CardFace;
  total: number;
  finish?: Finish;
  claimedBy?: string;
  reveal?: CardReveal;
  className?: string;
}) {
  const inkText = face.onBrandColor.toUpperCase() !== "#FFFFFF";
  const rarColor = reveal ? TIER_VAR[reveal.tier] : TIER_VAR.rare;
  const got = reveal?.tier === "thank_you" ? "Thank you for coming through" : "You got a Tikka!";

  return (
    <div className={`tk-cardwrap ${className}`} style={{ ...bizStyle(face), "--tk-rar": rarColor } as CSSProperties}>
      <div className="tk-shadow" />
      <div className="tk-glow" />
      <div className="tk-glow-rar" />
      <div className="tk-tilt">
        <div className="tk-shake">
          <div className="tk-inner">
            <div className="tk-face tk-front">
              <CardCover background={face.background} />
              {face.verified && (
                <span className="tk-verified">
                  <Tick />
                  Verified
                </span>
              )}
              <div className="tk-logo" aria-hidden="true">
                {face.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face.logoUrl} alt="" width={54} height={54} />
                ) : (
                  face.initials
                )}
              </div>
              <div className="tk-info">
                <div className="tk-name">{face.name}</div>
                <div className="tk-cat">
                  {face.category} · {place(face.area, face.city)}
                </div>
                {face.rating ? (
                  <div className="tk-rating">
                    <Star />
                    {face.rating} · {face.reviewCount} Tikka reviews
                  </div>
                ) : null}
                {face.tagline && <div className="tk-line">{face.tagline}</div>}
              </div>
              <div className="tk-stub">
                <div className="tk-perf" />
                <div className="tk-serial">
                  <span>{claimedBy ? `Claimed by ${claimedBy}` : `No. •••• / ${total}`}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inkText ? "/brand/tikka-lockup-mono-ink.svg" : "/brand/tikka-lockup-mono-white.svg"}
                    alt="Tikka"
                    width={48}
                    height={14}
                  />
                </div>
                <div className="tk-stub-cta">{claimedBy ? "Hold to open" : "Claim to see what's inside"}</div>
              </div>
              {finish === "holo" && <div className="tk-holo" />}
              {finish === "foil" && <div className="tk-foil" />}
            </div>

            <div className="tk-face tk-back">
              {reveal && (
                <>
                  <div className="tk-back-body">
                    <RarityBadge tier={reveal.tier} />
                    <Spark className="tk-bigspark" />
                    <div className="tk-got">{got}</div>
                    <div className="tk-from">
                      from {face.name} · {place(face.area, face.city)}
                    </div>
                    <div className="tk-issued">
                      <span>
                        Issued to {reveal.claimer} · No. {reveal.serial} / {total}
                      </span>
                    </div>
                  </div>
                  <div className="tk-stub">
                    <div className="tk-perf" />
                    <div className="tk-reward">{reveal.reward}</div>
                    {reveal.instruction && <div className="tk-instr">{reveal.instruction}</div>}
                    <div className="tk-code">
                      <span>{reveal.code}</span>
                      <span>Till {reveal.expiry}</span>
                    </div>
                  </div>
                  {reveal.tier === "legendary" && <div className="tk-holo" />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The top of the card front: the business's colour (with Tikka's soft shapes), a pattern, or a photo. */
function CardCover({ background = { type: "color" } }: { background?: CardBackground }) {
  if (background.type === "pattern") return <div className={`tk-pattern tk-pattern--${background.pattern}`} aria-hidden="true" />;
  if (background.type === "photo")
    return (
      <div className="tk-cover tk-cover--photo" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background.url} alt="" />
      </div>
    );
  return (
    <div className="tk-cover" aria-hidden="true">
      <div className="tk-blob" style={{ width: 200, height: 200, right: -50, top: -80, background: "rgba(255,255,255,.14)" }} />
      <div className="tk-blob" style={{ width: 130, height: 130, left: -40, top: 30, background: "rgba(0,0,0,.16)" }} />
      <div className="tk-blob" style={{ width: 74, height: 74, left: 132, top: 62, background: "rgba(255,255,255,.22)" }} />
      <div className="tk-blob" style={{ width: 24, height: 24, right: 74, top: 96, background: "rgba(255,255,255,.5)" }} />
    </div>
  );
}
