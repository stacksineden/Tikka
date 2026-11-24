import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardEditor } from "@/components/contact-cards/CardEditor";
import { getBookingSetup } from "@/lib/bookings-data";
import { cardQrColors, contactScanPath } from "@/lib/contact-cards";
import { getContactCard, getContactCards } from "@/lib/contact-cards-data";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Design your card" };

async function Editor({ params }: PageProps<"/app/posters/cards/[id]">) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const { id } = await params;
  const [found, all, setup] = await Promise.all([getContactCard(user, id), getContactCards(user), getBookingSetup(user)]);
  if (!found) notFound();
  const { business: b, card } = found;
  const qr = await qrSvg(`${SITE}${contactScanPath(card.code)}`, cardQrColors(b));
  return <CardEditor b={b} card={card} qr={qr} bookingsOn={!!setup?.enabled} team={b.page?.team ?? []} canRemove={all.length > 1} />;
}

export default function CardEditorPage(props: PageProps<"/app/posters/cards/[id]">) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div>
        <h1 className="text-heading">Design your card</h1>
        <p className="text-body mt-1 text-ink-muted">Tap the card to see the other side.</p>
      </div>
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Editor {...props} />
      </Suspense>
    </div>
  );
}
