import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardFace, type CardBusiness, type CardSettings } from "@/components/contact-cards/CardFace";
import { cardQrColors, contactScanPath, CONTACT_STYLES, defaultStyle } from "@/lib/contact-cards";
import { getBusinessBySlug } from "@/lib/data";
import { qrSvg, SITE } from "@/lib/qr";
import type { PortfolioPhoto } from "@/lib/types";

// DEV ONLY: every business card style, front and back, for the demo studios, at real size. For
// checking the card face (components/contact-cards/CardFace.tsx) against the approved prototype
// (design/business-cards/prototype.html). The demo portfolios' photos aren't in the repo, so the
// prototype's photos stand in.

export const metadata: Metadata = { title: "Business cards", robots: { index: false, follow: false } };

const photo = (id: string): PortfolioPhoto => ({ id, kind: "photo", url: `/dev/contact-cards/${id}.webp`, thumbUrl: `/dev/contact-cards/${id}.webp` });
const STAND_INS: Record<string, PortfolioPhoto[]> = {
  glowstudio: [photo("glow-salon")],
  "imole-studio": [photo("imole-headshot"), photo("imole-graduation"), photo("imole-nurse")],
};
const PEOPLE: Record<string, { name: string; role: string }> = {
  glowstudio: { name: "Funmi Adeyemi", role: "Founder & skin therapist" },
  "imole-studio": { name: "Kunle Adesina", role: "Lead photographer" },
};
const CODES: Record<string, string> = { glowstudio: "AC7KQM", "imole-studio": "HT4PRX" };

const base: CardSettings = { rounded: false, showPhone: true, showInstagram: true, showPlace: true };

async function Studio({ slug }: { slug: string }) {
  const found = await getBusinessBySlug(slug);
  if (!found) return <p>{slug} isn&apos;t in the demo data.</p>;
  const b: CardBusiness = { ...found.business, portfolio: STAND_INS[slug] ?? found.business.portfolio };
  const qr = await qrSvg(`${SITE}${contactScanPath(CODES[slug])}`, cardQrColors(b));
  const person = { ...base, personName: PEOPLE[slug].name, personRole: PEOPLE[slug].role };

  return (
    <section style={{ display: "grid", gap: 24 }}>
      <h2 className="text-heading">
        {b.name} <span className="text-body text-ink-muted">· default style: {defaultStyle(b)}</span>
      </h2>
      {CONTACT_STYLES.map((s) => (
        <div key={s.id} style={{ display: "grid", gap: 8 }}>
          <h3 className="text-title">{s.label}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <CardFace b={b} card={{ ...base, style: s.id }} side="front" bookingsOn />
            <CardFace b={b} card={{ ...base, style: s.id }} side="back" qr={qr} bookingsOn />
            <CardFace b={b} card={{ ...person, style: s.id, rounded: true }} side="back" qr={qr} bookingsOn={false} />
          </div>
        </div>
      ))}
      <div style={{ display: "grid", gap: 8 }}>
        <h3 className="text-title">Long page address (30 characters)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <CardFace b={{ ...b, slug: "marilkaybeautyandcontentstudio" }} card={base} side="back" qr={qr} bookingsOn />
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <h3 className="text-title">With bleed (print)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <CardFace b={b} card={base} side="front" bookingsOn bleed />
          <CardFace b={b} card={base} side="back" qr={qr} bookingsOn bleed />
        </div>
      </div>
    </section>
  );
}

export default function ContactCardsDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main data-theme="light" className="min-h-dvh bg-surface-sunken text-ink" style={{ padding: 16, display: "grid", gap: 48 }}>
      <div>
        <h1 className="text-display-lg">Business cards</h1>
        <p className="text-body text-ink-muted">Real size (85 × 55 mm). Third card in each row: a person&apos;s card, rounded corners, bookings off.</p>
      </div>
      <Suspense fallback={<p>Loading…</p>}>
        <Studio slug="glowstudio" />
      </Suspense>
      <Suspense fallback={<p>Loading…</p>}>
        <Studio slug="imole-studio" />
      </Suspense>
    </main>
  );
}
