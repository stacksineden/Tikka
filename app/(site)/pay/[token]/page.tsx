import "@/components/business/site.css";
import type { Metadata } from "next";
import { BadgeCheck, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { PayButton } from "@/components/payments/PayButton";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { getBusinessBySlug } from "@/lib/data";
import { naira, shortDate } from "@/lib/format";
import { bookingNumber } from "@/lib/page";
import { dbCompletePayLink, dbPayPage } from "@/lib/paylinks-db";
import { demoPayPage, isDemoToken } from "@/lib/paylinks-demo";
import { DemoPayButton } from "@/components/payments/DemoPayButton";

/** A real pay link, or (new direction, development) a demo one. */
const payPage = (token: string) => (isDemoToken(token) ? demoPayPage(token) : dbPayPage(token));
import { sendPayLinkAlert } from "@/lib/push";
import { verifyPayment } from "@/lib/paystack";
import { siteUrl } from "@/lib/supabase/env";

// A pay link (REVENUE_PLAN 5.3): the business, what it's for and how much, then Paystack. Back from
// Paystack (?reference=), the payment is checked with Paystack and recorded before the receipt shows;
// the webhook records it too, whichever comes first. Never the business's account details.

// The link preview in WhatsApp says what it is: "Pay ₦200 to Stacks Glow · Conrrows".
export async function generateMetadata({ params }: PageProps<"/pay/[token]">): Promise<Metadata> {
  const { token } = await params;
  const link = await payPage(token);
  const found = link ? await getBusinessBySlug(link.businessSlug) : null;
  if (!link || !found) return { title: "Pay", robots: { index: false, follow: false } };
  const amount = naira(link.amountKobo / 100);
  const title = link.status === "paid" ? `Paid ${amount} to ${found.business.name}` : `Pay ${amount} to ${found.business.name}`;
  const description = `${link.note}. Pay securely by card, bank transfer or USSD.`;
  return {
    title: { absolute: `${title} · ${link.note}` },
    description,
    openGraph: { title: `${title} · ${link.note}`, description, type: "website" },
    robots: { index: false, follow: false },
  };
}

async function Pay({ params, searchParams }: { params: PageProps<"/pay/[token]">["params"]; searchParams: PageProps<"/pay/[token]">["searchParams"] }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const reference = typeof sp.reference === "string" ? sp.reference : null;
  if (reference && reference.startsWith(`pl_${token}_`)) {
    const v = await verifyPayment(reference).catch(() => null);
    if (v?.status === "success") {
      const r = await dbCompletePayLink(reference, v.amountKobo, v.feeKobo, v.email);
      const id = r.id;
      if (r.kind === "paid" && id) after(() => sendPayLinkAlert(id));
    }
  }
  const link = await payPage(token);
  if (!link) notFound();
  const found = await getBusinessBySlug(link.businessSlug);
  if (!found) notFound();
  const b = found.business;
  const number = bookingNumber(b);
  const amount = naira(link.amountKobo / 100);
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;

  return (
    <div className={`${bizSerif.variable} mx-auto grid max-w-md gap-5 px-4 pb-16 pt-8`} style={style}>
      <Link href={`/${b.slug}`} className="text-label text-ink-muted">
        ← {b.name}
      </Link>
      <section className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised">
        <div className="px-5 pb-4 pt-5" style={{ background: "var(--biz)", color: "var(--on-biz)" }}>
          <p className="text-label opacity-90">{link.status === "paid" ? "Paid" : `Pay ${b.name}`}</p>
          <p className="biz-serif mt-1 text-[40px] leading-none tracking-[-0.01em]">{amount}</p>
          <p className="mt-2 text-[16px] font-semibold">{link.note}</p>
        </div>
        <div className="relative h-0 border-t border-dashed border-line" aria-hidden="true" />
        <div className="grid gap-3 px-5 py-4">
          {link.status === "paid" ? (
            <>
              <p className="text-body flex items-center gap-2 font-semibold text-success">
                <BadgeCheck size={20} aria-hidden="true" />
                Paid{link.paidAt ? ` on ${shortDate(link.paidAt)}` : ""}. Thank you{link.customerName ? `, ${link.customerName}` : ""}!
              </p>
              <p className="text-body text-ink-muted">{isDemoToken(token) ? "" : "Paystack has emailed your receipt. "}Show this page at {b.name} if they ask.</p>
            </>
          ) : link.status === "cancelled" ? (
            <p className="text-body">{b.name} cancelled this pay link. Message them if you still need to pay.</p>
          ) : (
            <>
              {link.customerName && <p className="text-body">Hi {link.customerName}, this is from {b.name}.</p>}
              {isDemoToken(token) ? <DemoPayButton token={token} label={`Pretend it's paid (demo)`} /> : <PayButton token={token} label={`Pay ${amount}`} />}
              <p className="text-caption flex items-start gap-2 text-ink-muted">
                <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                Paid securely through Tikka with Paystack: card, bank transfer or USSD. The money goes to {b.name}. Payments aren&apos;t refundable through Tikka; for anything about this payment, message {b.name}.
              </p>
            </>
          )}
        </div>
      </section>
      {number && (
        <a
          href={whatsappLink(
            number,
            link.status === "paid"
              ? `Hi ${b.name}, I've paid ${amount} for ${link.note} through Tikka${link.paidAt ? ` (${shortDate(link.paidAt)})` : ""}. Here's my receipt: ${siteUrl()}/pay/${token}`
              : `Hi ${b.name}, I have a question about the ${amount} pay link for ${link.note}.`,
          )} target="_blank" rel="noopener noreferrer" className="biz-btn min-h-12 w-full border border-line-strong">
          <ActionIcon kind="whatsapp" />
          Message {b.name}
        </a>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/pay/[token]">) {
  return (
    <main data-theme="light" className="min-h-dvh bg-surface-sunken text-ink">
      <Suspense fallback={<div className="h-dvh" />}>
        <Pay params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
