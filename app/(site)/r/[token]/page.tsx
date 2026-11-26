import "@/components/business/site.css";
import type { Metadata } from "next";
import { BadgeCheck, Car } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { naira } from "@/lib/format";
import { bookingNumber } from "@/lib/page";
import { receiptPage } from "@/lib/receipts-data";

// NEW DIRECTION: a receipt the owner sends a customer: the business, what it was for, each payment
// and how it was made, and what's still owed. Proof of payment, not a tax invoice. Never the
// customer's number. Worked out from the sale each time, so a balance paid later shows here too.

export async function generateMetadata({ params }: PageProps<"/r/[token]">): Promise<Metadata> {
  const { token } = await params;
  const found = await receiptPage(token);
  if (!found) return { title: "Receipt", robots: { index: false, follow: false } };
  const title = `Receipt from ${found.business.name} · ${found.receipt.item}`;
  return { title: { absolute: title }, description: `${naira(found.receipt.paidKobo / 100)} paid.`, robots: { index: false, follow: false } };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function Receipt({ params }: { params: PageProps<"/r/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const found = await receiptPage(token);
  if (!found) notFound();
  const { receipt: r, business: b } = found;
  const number = bookingNumber(b);
  const full = r.owedKobo === 0;
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;

  return (
    <div className={`${bizSerif.variable} mx-auto grid max-w-md gap-5 px-4 pb-16 pt-8`} style={style}>
      <Link href={`/${b.slug}`} className="text-label text-ink-muted">
        ← {b.name}
      </Link>
      <section className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised">
        <div className="px-5 pb-4 pt-5" style={{ background: "var(--biz)", color: "var(--on-biz)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-label opacity-90">Receipt</p>
            <p className="font-mono text-[13px] opacity-90">{r.number}</p>
          </div>
          <p className="biz-serif mt-1 text-[28px] leading-tight">{b.name}</p>
          <p className="mt-1 text-[14px] opacity-90">{day(r.at)}</p>
        </div>
        <div className="relative h-0 border-t border-dashed border-line" aria-hidden="true" />
        <div className="grid gap-4 px-5 py-4">
          <div>
            <p className="text-caption text-ink-muted">For {r.customer}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <span className="min-w-0">
                <b className="block text-[17px]">{r.item}</b>
                {r.detail && <span className="text-caption block text-ink-muted">{r.detail}</span>}
                {r.homeArea && (
                  <span className="text-caption mt-0.5 inline-flex items-center gap-1 text-ink-muted">
                    <Car size={12} aria-hidden="true" /> Home visit · {r.homeArea}
                  </span>
                )}
              </span>
              <b className="shrink-0 font-mono text-[16px]">{naira((r.totalKobo - (r.added?.kobo ?? 0)) / 100)}</b>
            </div>
            {r.added && (
              <>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-body">Added on the day: {r.added.label}</span>
                  <b className="shrink-0 font-mono text-[16px]">{naira(r.added.kobo / 100)}</b>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <span className="text-body font-semibold">Total</span>
                  <b className="shrink-0 font-mono text-[16px]">{naira(r.totalKobo / 100)}</b>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-1.5 border-t border-line pt-3">
            <p className="text-caption text-ink-muted">Paid</p>
            {r.payments.length === 0 && <p className="text-body text-ink-muted">Nothing paid yet.</p>}
            {r.payments.map((p, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3">
                <span>
                  {p.label} <span className="text-caption text-ink-muted">· {short(p.at)}</span>
                </span>
                <span className="font-mono">{naira(p.kobo / 100)}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5 border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <b>Total paid</b>
              <b className="font-mono text-[17px]">{naira(r.paidKobo / 100)}</b>
            </div>
            {!full && (
              <div className="flex items-baseline justify-between gap-3 text-danger">
                <span>Still to pay</span>
                <b className="font-mono">{naira(r.owedKobo / 100)}</b>
              </div>
            )}
          </div>

          {full && (
            <p className="text-body flex items-center gap-2 font-semibold text-success">
              <BadgeCheck size={20} aria-hidden="true" /> Paid in full. Thank you!
            </p>
          )}
        </div>
      </section>
      <p className="text-caption text-center text-ink-muted">Keep this link as your receipt. Questions about it? Message {b.name}.</p>
      {number && (
        <a href={whatsappLink(number, `Hi ${b.name}, about my receipt ${r.number} for ${r.item}.`)} target="_blank" rel="noopener noreferrer" className="biz-btn min-h-12 w-full border border-line-strong">
          <ActionIcon kind="whatsapp" />
          Message {b.name}
        </a>
      )}
      <p className="text-caption text-center text-ink-muted">Made with Tikka</p>
    </div>
  );
}

export default function Page(props: PageProps<"/r/[token]">) {
  return (
    <main data-theme="light" className="min-h-dvh bg-surface-sunken text-ink">
      <Suspense fallback={<div className="h-dvh" />}>
        <Receipt params={props.params} />
      </Suspense>
    </main>
  );
}
