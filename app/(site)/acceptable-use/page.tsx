import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";

// The Acceptable Use Policy for businesses that take customer payments through Tikka (deposits and
// pay links), written 23 Nov 2026 for Paystack's business review. It follows how Tikka works:
// payments only after an ID check (supabase/migrations/20261129100000_id_verification.sql), money
// split straight to the business's own Paystack subaccount, Tikka never refunds (REVENUE_PLAN 5.2).
// To be checked by Tikka's lawyer like the terms and privacy policy.
const UPDATED = "23 November 2026";
const CONTACT = "hello@usetikka.com";

export const metadata: Metadata = {
  title: "Acceptable use",
  description: "What businesses can and can't take payments for on Tikka, and how refunds and disputes work.",
};

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About this policy",
    body: (
      <p>
        This policy is for businesses that take payments from their customers through Tikka: booking deposits and pay links. It sits alongside our{" "}
        <Link href="/terms" className="text-brand underline">terms</Link> and{" "}
        <Link href="/privacy" className="text-brand underline">privacy policy</Link>. Payments are processed by Paystack, so Paystack&apos;s own rules apply too. If
        you take payments through Tikka, you agree to this policy.
      </p>
    ),
  },
  {
    id: "who",
    title: "Who can take payments",
    body: (
      <ul>
        <li>Real businesses in Nigeria that provide lawful services to customers in person, at your place or theirs (for example beauty, hair, nails, photography and wellness).</li>
        <li>
          Before payments are switched on, the owner sends a valid government ID and, if the business is registered, its CAC number and certificate. Tikka&apos;s team
          reviews every business by hand.
        </li>
        <li>Payments go to a bank account in the owner&apos;s name or the business&apos;s name, checked through your bank. Never someone else&apos;s account.</li>
        <li>Tikka sets the most you can take in one payment, based on your prices. Ask us if you need more.</li>
      </ul>
    ),
  },
  {
    id: "for",
    title: "What you can take payments for",
    body: (
      <ul>
        <li>A deposit to hold a booking with your business.</li>
        <li>A payment for a service your business provides, before or after you provide it.</li>
        <li>Amounts that match the prices on your page or what you agreed with the customer.</li>
        <li>Your own business only: never on behalf of another business or person.</li>
      </ul>
    ),
  },
  {
    id: "not-allowed",
    title: "What's not allowed",
    body: (
      <>
        <p>You can&apos;t use Tikka payments for:</p>
        <ul>
          <li>Anything illegal in Nigeria, or anything that helps someone break the law.</li>
          <li>Alcohol, tobacco, vapes or anything else age-restricted, and adult content or services.</li>
          <li>Games of chance that people pay to take part in.</li>
          <li>Weapons, drugs, or medicines that need a prescription.</li>
          <li>Medical or cosmetic procedures you aren&apos;t licensed to carry out, such as injections.</li>
          <li>Loans, investments, savings schemes, cryptocurrency, foreign exchange or sending money for others.</li>
          <li>Pyramid schemes, &ldquo;get rich&rdquo; schemes or multi-level marketing.</li>
          <li>Goods that need to be posted or delivered. Tikka payments are for services you provide in person.</li>
          <li>Fake, copied or stolen goods, or anything that uses someone else&apos;s brand without permission.</li>
          <li>Donations, fundraising or collecting money for a cause.</li>
          <li>Misleading prices or offers, or charging for something you don&apos;t provide.</li>
        </ul>
      </>
    ),
  },
  {
    id: "yours",
    title: "Your responsibilities",
    body: (
      <ul>
        <li>Say clearly what each payment is for, what it costs and what&apos;s included, and your deposit rules, before the customer pays.</li>
        <li>Provide the service the customer paid for, at the time booked, as described.</li>
        <li>Keep your details on Tikka true and up to date, including your bank account.</li>
        <li>Reply to your customers&apos; questions and complaints, and keep a record of what you provided.</li>
        <li>Follow the law that applies to your business, including consumer and data protection law.</li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Refunds and disputes",
    body: (
      <>
        <p>
          Your customer&apos;s payment goes straight to your bank account through Paystack. Tikka never holds it, so Tikka can&apos;t refund it. You are responsible
          for your service and for any refund.
        </p>
        <ul>
          <li>Deposits are shown to customers as not refundable before they pay. That doesn&apos;t apply if you cancel, or don&apos;t provide the service: then you must refund the customer.</li>
          <li>If a customer contacts Tikka about a payment, we&apos;ll contact you, share the records we hold (the booking, the payment and whether they came in) and help you settle it.</li>
          <li>
            If a customer disputes a payment with their bank (a chargeback), you&apos;re responsible for it. Send us or Paystack the evidence you have, such as the
            booking, messages and proof that you provided the service, within the time Paystack gives.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "tikka",
    title: "What Tikka may do",
    body: (
      <ul>
        <li>Review your business at any time and ask for more information or documents.</li>
        <li>Lower your limit per payment, pause your payments, or suspend your account if you break this policy, if customers complain repeatedly, or if we suspect fraud.</li>
        <li>Share information with Paystack, and with the authorities when the law requires it.</li>
        <li>We&apos;ll tell you why we&apos;ve acted, unless the law stops us. Drops, bookings without deposits and redeeming keep working while payments are paused, unless your account is suspended.</li>
      </ul>
    ),
  },
  {
    id: "report",
    title: "Reporting a business",
    body: (
      <p>
        If you paid a business through Tikka and something went wrong, contact the business first. If that doesn&apos;t work, or you think something breaks this
        policy, email {CONTACT} with the business&apos;s name and what happened. We look at every report.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <>
        <p>We may update this policy. If a change matters, we&apos;ll update the date at the top and tell businesses that take payments before it applies.</p>
        <p>This policy is governed by the laws of the Federal Republic of Nigeria. Questions: {CONTACT}.</p>
      </>
    ),
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable use"
      updated={UPDATED}
      draft={false}
      intro={<p>What businesses can and can&apos;t take payments for on Tikka, and how refunds and disputes work, in plain words.</p>}
      sections={sections}
      other={{ href: "/terms", label: "terms" }}
    />
  );
}
