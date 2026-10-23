/* eslint-disable @next/next/no-img-element -- print pages use plain <img> so the browser's PDF keeps them crisp at any size. */
import { Camera, MessageCircle, Store } from "lucide-react";
import { place } from "@/lib/format";
import { spacedCode } from "@/lib/posters";
import type { Business } from "@/lib/types";

// The printable QR poster (PRD A7). Designed once at A5 trim (148 × 210 mm) in millimetres;
// other sizes zoom it. It explains itself: who it's from, what to do, and a typed fallback.
// Nothing drop-specific, so it never needs reprinting.

export type PosterBusiness = Pick<Business, "name" | "initials" | "logoUrl" | "brandColor" | "onBrandColor" | "area" | "city">;

/** Light text on the brand colour → the reversed Tikka lockup (never recoloured). */
function lockup(onBrand: string): string {
  const hex = onBrand.replace("#", "");
  const n = parseInt(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex, 16);
  const light = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
  return light ? "/brand/tikka-lockup-reversed.svg" : "/brand/tikka-lockup.svg";
}

function Mark({ b, size }: { b: PosterBusiness; size: string }) {
  return b.logoUrl ? (
    <img src={b.logoUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "0.6mm solid var(--surface-raised)" }} />
  ) : (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "var(--surface-raised)",
        color: b.brandColor,
        font: `800 calc(${size} * 0.38)/1 var(--font-display)`,
      }}
    >
      {b.initials}
    </span>
  );
}

const STEPS = [
  { Icon: Camera, text: "Scan with your phone camera" },
  { Icon: MessageCircle, text: "Claim it on WhatsApp" },
  { Icon: Store, text: "Show your Tikka at the counter" },
];

/** The A5 face: 148 × 210 mm. */
export function PosterFace({ b, code, qr, hook }: { b: PosterBusiness; code: string; qr: string; hook: string }) {
  const on = b.onBrandColor;
  return (
    <div
      style={{
        width: "148mm",
        height: "210mm",
        background: b.brandColor,
        color: on,
        padding: "10mm 10mm 8mm",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "3.5mm" }}>
        <Mark b={b} size="14mm" />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "800 6.2mm/1.1 var(--font-display)", letterSpacing: "-0.02em" }}>{b.name}</div>
          <div style={{ font: "500 3.4mm/1.3 var(--font-sans)", opacity: 0.85 }}>{place(b.area, b.city)}</div>
        </div>
      </div>

      <h1 style={{ margin: "7mm 0 0", font: "800 12.5mm/1 var(--font-display)", letterSpacing: "-0.03em" }}>Scan to get your Tikka</h1>
      <p style={{ margin: "3mm 0 0", font: "500 4.4mm/1.35 var(--font-sans)", opacity: 0.92 }}>{hook}</p>

      {/* The ticket: QR above the perforation, the typed fallback on the stub. */}
      <div style={{ position: "relative", marginTop: "6mm", background: "var(--surface-raised)", color: "var(--ink)", borderRadius: "5mm", padding: "6mm 6mm 4.5mm" }}>
        <div style={{ display: "grid", placeItems: "center" }}>
          <div style={{ width: "64mm", height: "64mm" }} dangerouslySetInnerHTML={{ __html: qr.replace("<svg", '<svg width="100%" height="100%"') }} />
        </div>
        <div style={{ position: "relative", margin: "5mm -6mm 0", borderTop: "0.5mm dashed var(--line-strong)" }}>
          {[{ left: "-3mm" }, { right: "-3mm" }].map((side, i) => (
            <span key={i} style={{ position: "absolute", top: "-3.25mm", width: "6mm", height: "6mm", borderRadius: "50%", background: b.brandColor, ...side }} />
          ))}
        </div>
        <div style={{ marginTop: "4mm", textAlign: "center" }}>
          <div style={{ font: "500 3.3mm/1.3 var(--font-sans)", color: "var(--ink-muted)" }}>Camera not working? Go to</div>
          <div style={{ font: "700 4.4mm/1.3 var(--font-sans)" }}>usetikka.com/q and enter</div>
          <div style={{ font: "700 9mm/1.15 var(--font-mono)", letterSpacing: "0.12em", marginTop: "1mm" }}>{spacedCode(code)}</div>
        </div>
      </div>

      <ol style={{ listStyle: "none", margin: "6mm 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3mm" }}>
        {STEPS.map(({ Icon, text }, i) => (
          <li key={text} style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: "1.5mm" }}>
            <span style={{ position: "relative", width: "10mm", height: "10mm", borderRadius: "50%", border: `0.5mm solid ${on}`, display: "grid", placeItems: "center" }}>
              <Icon style={{ width: "5mm", height: "5mm" }} strokeWidth={2} aria-hidden="true" />
              <span
                style={{
                  position: "absolute",
                  top: "-1.5mm",
                  right: "-1.5mm",
                  width: "4.4mm",
                  height: "4.4mm",
                  borderRadius: "50%",
                  background: on,
                  color: b.brandColor,
                  font: "700 2.8mm/4.4mm var(--font-mono)",
                  textAlign: "center",
                }}
              >
                {i + 1}
              </span>
            </span>
            <span style={{ font: "600 3.3mm/1.25 var(--font-sans)" }}>{text}</span>
          </li>
        ))}
      </ol>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "3mm", paddingTop: "4mm" }}>
        <span style={{ font: "600 3.2mm/1.3 var(--font-sans)", opacity: 0.9 }}>No app needed · Every Tikka holds something</span>
        <img src={lockup(on)} alt="Tikka" style={{ height: "6mm", width: "auto" }} />
      </div>
    </div>
  );
}

/** The 5 cm sticker: name, QR and the typed code only. */
export function StickerFace({ b, code, qr }: { b: PosterBusiness; code: string; qr: string }) {
  return (
    <div
      style={{
        width: "50mm",
        height: "50mm",
        background: b.brandColor,
        color: b.onBrandColor,
        borderRadius: "6mm",
        padding: "3mm",
        boxSizing: "border-box",
        display: "grid",
        justifyItems: "center",
        alignContent: "center",
        gap: "1.2mm",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
      }}
    >
      <div style={{ font: "800 3mm/1.1 var(--font-display)", maxWidth: "44mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Scan for a Tikka · {b.name}
      </div>
      <div style={{ background: "var(--surface-raised)", borderRadius: "2mm", padding: "1.2mm" }}>
        <div style={{ width: "28mm", height: "28mm" }} dangerouslySetInnerHTML={{ __html: qr.replace("<svg", '<svg width="100%" height="100%"') }} />
      </div>
      <div style={{ font: "700 3.2mm/1 var(--font-mono)", letterSpacing: "0.1em" }}>{spacedCode(code)}</div>
      <div style={{ font: "500 2.2mm/1 var(--font-sans)", opacity: 0.9 }}>usetikka.com/q</div>
    </div>
  );
}
