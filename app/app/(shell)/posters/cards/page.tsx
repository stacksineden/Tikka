import type { Metadata } from "next";
import { Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AddContactCard } from "@/components/contact-cards/AddContactCard";
import { CardFace } from "@/components/contact-cards/CardFace";
import { FitCard } from "@/components/contact-cards/FitCard";
import { PostersTabs } from "@/components/contact-cards/PostersTabs";
import { RemoveCard } from "@/components/contact-cards/RemoveCard";
import { getBookingSetup } from "@/lib/bookings-data";
import { cardQrColors, contactScanPath, MAX_CONTACT_CARDS } from "@/lib/contact-cards";
import { getContactCards } from "@/lib/contact-cards-data";
import { getBusiness } from "@/lib/data";
import { count } from "@/lib/format";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Business cards" };

// Posters & cards › Business cards (docs/BUSINESS_CARDS.md). Free for every business. The first
// card is made from their page the first time they come here.

async function Cards() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [b, cards, setup] = await Promise.all([getBusiness(user), getContactCards(user), getBookingSetup(user)]);
  if (!b) redirect("/app/setup");
  const bookingsOn = !!setup?.enabled;
  const qrs = await Promise.all(cards.map((c) => qrSvg(`${SITE}${contactScanPath(c.code)}`, cardQrColors(b))));

  return (
    <div className="grid gap-5">
      {cards.map((c, i) => (
        <section key={c.id} className="grid gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-6" aria-labelledby={`cc-${c.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`cc-${c.id}`} className="text-title">
                {c.personName ? `${c.personName}'s card` : "Your business card"}
              </h2>
              <p className="text-caption mt-1 text-ink-muted">
                {count(c.scansMonth)} scan{c.scansMonth === 1 ? "" : "s"} this month · the QR opens usetikka.com/{b.slug}
              </p>
            </div>
            <Link href={`/app/posters/cards/${c.id}`} className="btn btn-secondary min-h-11 px-4 text-label">
              <Pencil />
              Change design
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FitCard>
              <CardFace b={b} card={c} side="front" bookingsOn={bookingsOn} />
            </FitCard>
            <FitCard>
              <CardFace b={b} card={c} side="back" qr={qrs[i]} bookingsOn={bookingsOn} />
            </FitCard>
          </div>
          <div className="grid gap-2">
            <span className="text-label">Print</span>
            {/* items-start: the Remove confirmation sits on its own line and never stretches the buttons. */}
            <div className="grid grid-cols-2 items-start gap-2 sm:flex sm:flex-wrap">
              <Link href={`/app/posters/cards/${c.id}/print?format=printer`} className="btn btn-secondary min-h-11 px-3 text-label">
                <Printer />
                For a printer
              </Link>
              <Link href={`/app/posters/cards/${c.id}/print?format=sheet`} className="btn btn-secondary min-h-11 px-3 text-label">
                <Printer />
                A4 sheet, 10 cards
              </Link>
              {cards.length > 1 && <RemoveCard cardId={c.id} />}
            </div>
          </div>
        </section>
      ))}
      {cards.length < MAX_CONTACT_CARDS && <AddContactCard team={b.page?.team ?? []} />}
    </div>
  );
}

export default function BusinessCardsPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div className="grid gap-4">
        <div>
          <h1 className="text-heading">Posters &amp; cards</h1>
          <p className="text-body mt-1 text-ink-muted">Business cards in your own colours, free. Hand them out; the QR opens your page so people can book.</p>
        </div>
        <PostersTabs current="cards" />
      </div>
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Cards />
      </Suspense>
    </div>
  );
}
