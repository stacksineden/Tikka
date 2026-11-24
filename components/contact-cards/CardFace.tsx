/* eslint-disable @next/next/no-img-element -- print pages use plain <img> so the browser's PDF keeps them crisp at any size. */
import { bizSerif } from "@/components/business/fonts";
import {
  boldLines,
  CARD_BLEED_MM,
  CARD_MM,
  cardCta,
  cardHeading,
  cardInk,
  cardPhoto,
  cardPlace,
  cardStyle,
  contactLines,
  fitMm,
  pageLink,
  whatWeDo,
  type ContactCard,
} from "@/lib/contact-cards";
import { deepen } from "@/lib/color";
import type { Business } from "@/lib/types";
import "./card.css";

// A business card, front or back (docs/BUSINESS_CARDS.md), ported from the approved prototype
// (design/business-cards/prototype.html). Drawn at its real size in millimetres, so the editor's
// preview, the list and the print kit are the same card: screens zoom it, print uses it as is.
// With `bleed` the colour or photo runs 3 mm past the trim for the printer.

export type CardBusiness = Pick<
  Business,
  "name" | "slug" | "initials" | "logoUrl" | "brandColor" | "onBrandColor" | "category" | "area" | "city" | "serveMode" | "actions" | "services" | "portfolio" | "tagline" | "page"
>;
export type CardSettings = Pick<ContactCard, "style" | "photoId" | "personName" | "personRole" | "rounded" | "showPhone" | "showInstagram" | "showPlace">;

interface Props {
  b: CardBusiness;
  card: CardSettings;
  side: "front" | "back";
  /** The QR's SVG (lib/qr.ts qrSvg with cardQrColors()). Only the back uses it. */
  qr?: string;
  bookingsOn: boolean;
  bleed?: boolean;
}

/** The trim's inner width in mm, less the safe margins: what a headline may span. */
const SPAN = CARD_MM.w - 10;

export function CardFace({ b, card, side, qr, bookingsOn, bleed = false }: Props) {
  const style = cardStyle(card, b);
  const pad = bleed ? CARD_BLEED_MM : 0;
  const w = CARD_MM.w + 2 * pad;
  const h = CARD_MM.h + 2 * pad;
  const vars = {
    "--biz": b.brandColor,
    "--on-biz": b.onBrandColor,
    "--biz-ink": cardInk(b),
    "--biz-text": deepen(b.brandColor, 4.5),
  } as React.CSSProperties;
  const photo = style === "photo" && side === "front" ? cardPhoto(card, b) : undefined;

  return (
    <div
      className={`ccard ${bizSerif.variable}`}
      data-style={style}
      data-side={side}
      data-tone={b.page?.galleryTone === "light" ? "light" : "dark"}
      style={{ ...vars, width: `${w}mm`, height: `${h}mm`, borderRadius: !bleed && card.rounded ? "3mm" : 0 }}
    >
      {photo && <img src={photo.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />}
      {photo && <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgb(0 0 0 / 0.25) 0%, transparent 30%, transparent 45%, rgb(0 0 0 / 0.72) 100%)" }} />}
      <div className="ccard-trim" style={{ left: `${pad}mm`, top: `${pad}mm` }}>
        {side === "front" ? <Front b={b} style={style} /> : <Back b={b} card={card} qr={qr} bookingsOn={bookingsOn} />}
      </div>
    </div>
  );
}

function Front({ b, style }: { b: CardBusiness; style: ReturnType<typeof cardStyle> }) {
  const what = whatWeDo(b);
  if (style === "classic") {
    return (
      <>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2.4mm", padding: "0 7mm" }}>
          <Mark b={b} size={15} fill="var(--on-biz)" ink="var(--biz)" />
          <div className="ccard-serif" style={{ fontSize: `${fitMm(b.name, 6.4, SPAN - 4)}mm` }}>
            {b.name}
          </div>
          <div className="ccard-caps" style={{ fontSize: `${fitMm(what, 2.1, SPAN - 4, 0.78)}mm`, opacity: 0.8, letterSpacing: "0.2em" }}>
            {what}
          </div>
        </div>
        <div aria-hidden="true" style={{ position: "absolute", inset: "4mm 5mm", border: "0.25mm solid color-mix(in srgb, var(--on-biz) 30%, transparent)" }} />
      </>
    );
  }
  if (style === "photo") {
    return (
      <>
        <div style={{ position: "absolute", left: "5mm", top: "5mm" }}>
          <Mark b={b} size={8} ring />
        </div>
        <div style={{ position: "absolute", left: "5mm", right: "5mm", bottom: "5mm" }}>
          <div className="ccard-serif" style={{ fontSize: `${fitMm(b.name, 7, SPAN)}mm`, fontWeight: 300, letterSpacing: "-0.02em" }}>
            {b.name}
          </div>
          {b.tagline && (
            <div className="ccard-one-line" style={{ fontFamily: "var(--cc-serif)", fontStyle: "italic", fontSize: `${Math.max(2.2, fitMm(b.tagline, 2.9, SPAN, 0.45))}mm`, opacity: 0.85, marginTop: "1.4mm" }}>
              {b.tagline}
            </div>
          )}
        </div>
      </>
    );
  }
  if (style === "minimal") {
    return (
      <>
        <div style={{ position: "absolute", left: "6mm", top: "6mm" }}>
          <Mark b={b} size={7} fill="var(--biz)" ink="var(--on-biz)" />
        </div>
        <div style={{ position: "absolute", left: "6mm", right: "6mm", bottom: "6mm" }}>
          <div className="ccard-serif" style={{ fontSize: `${fitMm(b.name, 5.4, SPAN - 2)}mm`, fontWeight: 300 }}>
            {b.name}
          </div>
          <div aria-hidden="true" style={{ height: "0.25mm", width: "10mm", background: "var(--biz)", margin: "2.2mm 0" }} />
          <div className="ccard-caps" style={{ fontSize: `${fitMm(what, 2.1, SPAN - 2, 0.74)}mm`, opacity: 0.65 }}>
            {what}
          </div>
        </div>
      </>
    );
  }
  // Bold: the name very large, on two lines, the same size so they read as one.
  const [first, rest] = boldLines(b.name);
  const size = Math.min(fitMm(first, 19, SPAN + 4, 0.56), rest ? fitMm(rest, 19, SPAN - 5, 0.5) : 19);
  return (
    <>
      <div style={{ position: "absolute", left: "4mm", right: "-2mm", top: "3mm" }}>
        <div className="ccard-serif" style={{ fontSize: `${size}mm`, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.045em", position: "relative", zIndex: 1 }}>
          {first}
        </div>
        {rest && (
          <div className="ccard-serif" style={{ fontSize: `${size}mm`, lineHeight: 0.86, fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.04em", marginLeft: "9mm" }}>
            {rest}
          </div>
        )}
      </div>
      <div className="ccard-caps" style={{ position: "absolute", left: "5mm", right: "5mm", bottom: "4.4mm", display: "flex", justifyContent: "space-between", gap: "3mm", letterSpacing: "0.16em" }}>
        <span className="ccard-one-line">{what}</span>
        <span style={{ opacity: 0.7, flex: "none" }}>{cardPlace(b)}</span>
      </div>
    </>
  );
}

function Back({ b, card, qr, bookingsOn }: { b: CardBusiness; card: CardSettings; qr?: string; bookingsOn: boolean }) {
  const head = cardHeading(card, b);
  const lines = contactLines(card, b);
  return (
    <>
      <div className="ccard-back">
        <div className="ccard-left">
          <div>
            <div className="ccard-serif" style={{ fontSize: `${fitMm(head.name, 4.1, 44)}mm`, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
              {head.name}
            </div>
            <div className="ccard-sub ccard-one-line">{head.sub}</div>
          </div>
          <ul className="ccard-lines">
            {lines.phone && (
              <li>
                <ChatIcon />
                <span className="ccard-mono" style={{ letterSpacing: "0.02em" }}>
                  {lines.phone}
                </span>
              </li>
            )}
            {lines.instagram && (
              <li>
                <CameraIcon />
                <span className="ccard-one-line">{lines.instagram}</span>
              </li>
            )}
            {lines.place && (
              <li>
                <PinIcon />
                <span className="ccard-one-line">{lines.place}</span>
              </li>
            )}
          </ul>
        </div>
        <div className="ccard-qr">
          <div className="ccard-qr-tile" dangerouslySetInnerHTML={{ __html: qr ? qr.replace("<svg", '<svg width="100%" height="100%" role="img" aria-label="QR code to the business page"') : "" }} />
          <div>
            <div className="ccard-cta">{cardCta(bookingsOn, b.category)}</div>
            <div className="ccard-link ccard-mono" style={{ fontSize: `${Math.min(1.95, fitMm(pageLink(b.slug), 1.95, 27, 0.62))}mm` }}>
              {pageLink(b.slug)}
            </div>
          </div>
        </div>
      </div>
      <div className="ccard-made">Made with Tikka</div>
    </>
  );
}

/** The logo in a circle, or the initials when there's no logo yet. */
function Mark({ b, size, fill, ink, ring = false }: { b: CardBusiness; size: number; fill?: string; ink?: string; ring?: boolean }) {
  const box: React.CSSProperties = { width: `${size}mm`, height: `${size}mm`, fontSize: `${size * 0.38}mm` };
  if (b.logoUrl) {
    return (
      <span className="ccard-mark" style={{ ...box, border: ring ? "0.3mm solid currentColor" : undefined }}>
        <img src={b.logoUrl} alt="" />
      </span>
    );
  }
  return ring ? (
    <span className="ccard-mark" style={{ ...box, border: "0.3mm solid currentColor" }}>
      {b.initials}
    </span>
  ) : (
    <span className="ccard-mark" style={{ ...box, background: fill, color: ink }}>
      {b.initials}
    </span>
  );
}

/* Plain line icons in the card's own colour (no platform logos, never WhatsApp green). */
const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
function ChatIcon() {
  return (
    <svg {...icon} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg {...icon}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...icon} strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
