import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";

// PRD C1. Cleared by Tikka's lawyer on 10 Nov 2026 (including rewards that differ from Tikka to
// Tikka), to be updated as Tikka grows. The guarantee's conditions follow lib/guarantee.ts; the
// refund and liability wording is interim. scripts/check-legal.ts refuses a production build if a
// blank or the placeholder marker comes back.
const DRAFT = false;
const UPDATED = "10 November 2026";
const CONTACT = "hello@usetikka.com";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for claiming and using Tikkas, and for businesses that run drops on Tikka.",
};

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <p>
        These terms are an agreement between you and Tikka Limited (registration in progress) (&ldquo;Tikka&rdquo;). By claiming a Tikka or creating a business
        account, you agree to them. Part A is for everyone who claims Tikkas; part B is for businesses. Our{" "}
        <Link href="/privacy" className="text-brand underline">privacy policy</Link> explains what happens to your details.
      </p>
    ),
  },
  {
    id: "claiming",
    title: "A. Claiming a Tikka",
    body: (
      <ul>
        <li>Claiming a Tikka is free. You never have to buy anything to claim one.</li>
        <li>Every Tikka holds something. Which reward you get is set when you claim, and it can&apos;t be swapped.</li>
        <li>You can claim one Tikka per WhatsApp number from each drop. Claiming again sends you the same Tikka.</li>
        <li>Some drops are only for new customers, or for one claim in a set number of days. The drop page says so.</li>
        <li>Your Tikka lasts until the date on it. After that date, the business doesn&apos;t have to accept it.</li>
      </ul>
    ),
  },
  {
    id: "using",
    title: "A. Using your Tikka",
    body: (
      <ul>
        <li>Show your code at the business. Each Tikka can be used once.</li>
        <li>Treat your code like cash: anyone who shows it can use it. Tikka&apos;s share picture never shows the code, so share that instead.</li>
        <li>The reward comes from the business, not from Tikka. The business decides any conditions shown on the Tikka, such as a minimum spend or which days it works.</li>
        <li>If a business won&apos;t honour a valid Tikka, tell us at {CONTACT} and we&apos;ll take it up with them.</li>
        <li>Rewards have no cash value and can&apos;t be sold or exchanged for money.</li>
      </ul>
    ),
  },
  {
    id: "reviews",
    title: "A. Reviews",
    body: (
      <p>
        You can review a business once for each Tikka you used, within 30 days of using it. Reviews must be honest and about your own visit. Businesses can&apos;t
        edit or delete reviews; they can report one, and Tikka may hide a review that is abusive, false or shares someone&apos;s private details.
      </p>
    ),
  },
  {
    id: "business-account",
    title: "B. Business accounts",
    body: (
      <ul>
        <li>You must be allowed to act for the business and give true details about it.</li>
        <li>You&apos;re responsible for your account and for the staff you invite. Staff can check and accept codes; they can&apos;t see customers&apos; numbers.</li>
        <li>Your free business page and your listing on the marketplace must describe your real business.</li>
      </ul>
    ),
  },
  {
    id: "drops",
    title: "B. Running drops",
    body: (
      <ul>
        <li>You must honour every Tikka you give out, on the terms shown on it, until its date.</li>
        <li>Rewards must be real and lawful, and you must be able to provide them. No alcohol, tobacco or anything else age-restricted.</li>
        <li>Tikka decides which Tikka each person gets, fairly and at random from the mix you set. You can&apos;t pick who gets which reward.</li>
        <li>Drops last up to 30 days. You can add Tikkas, extend, or end a drop early; Tikkas already claimed stay valid until their date.</li>
      </ul>
    ),
  },
  {
    id: "customers",
    title: "B. Your customers' details",
    body: (
      <ul>
        <li>You may use the details of people who claimed your Tikkas to serve them and follow up on WhatsApp.</li>
        <li>Only send news about future drops to people who ticked &ldquo;Send me future drops&rdquo;, and stop when anyone asks you to.</li>
        <li>Don&apos;t sell or share customers&apos; details, and don&apos;t add them to other lists.</li>
        <li>You&apos;re responsible for following the Nigeria Data Protection Act for the details you keep and use.</li>
      </ul>
    ),
  },
  {
    id: "paying",
    title: "B. Paying for drops",
    body: (
      <ul>
        <li>Your first drop is free (up to 200 Tikkas). After that you pay per drop by its size, or buy a season pack of 3 drops. Prices are shown before you pay, in naira (₦).</li>
        <li>Payments go through Paystack. A drop goes live once its payment is confirmed.</li>
        <li>Founding members keep their founding price for single drops for as long as they use Tikka.</li>
        <li>
          The guarantee: if a paid drop of a size that has one brings fewer redemptions than the number shown when you bought it, your next drop of that size is
          free. It applies once per business, to drops you paid for (not free, pack or gifted drops), and only if your drop was seen from at least 3 different places (for example your WhatsApp status, your Instagram and a QR poster) and was built from a ready-made offer or with no drop-check warnings ignored. We check once the drop has ended and every claimed Tikka is used or past its date.
        </li>
        <li>Refunds: if you paid for a drop and never published it, ask us within 7 days of paying and we&apos;ll refund it. Once a drop is published, it isn&apos;t refunded, including if you end it early.</li>
      </ul>
    ),
  },
  {
    id: "rules",
    title: "Rules for everyone",
    body: (
      <ul>
        <li>Don&apos;t use Tikka to mislead people, to break the law, or to send spam.</li>
        <li>Don&apos;t try to claim more than your share, for example with numbers that aren&apos;t yours, or interfere with how Tikka works.</li>
        <li>Tikka may hide a drop or review, or suspend an account, that breaks these terms. We&apos;ll tell businesses why, unless the law stops us.</li>
      </ul>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility",
    body: (
      <p>
        Tikka provides the platform; each business provides its own rewards and service and is responsible for them. We work to keep Tikka running, but we can&apos;t
        promise it will never be interrupted. As far as the law allows, Tikka&apos;s total liability to a business is limited to what that business paid Tikka in the 12 months before the claim, and Tikka isn&apos;t liable for lost profits or other indirect losses. Nothing in these terms limits any right you have under Nigerian law that can&apos;t be limited.
      </p>
    ),
  },
  {
    id: "law",
    title: "Changes, law and contact",
    body: (
      <>
        <p>We may update these terms; if a change matters, we&apos;ll update the date at the top and tell businesses by email before it applies.</p>
        <p>These terms are governed by the laws of the Federal Republic of Nigeria. Questions: {CONTACT}.</p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      updated={UPDATED}
      draft={DRAFT}
      intro={<p>The rules for claiming and using Tikkas, and for businesses that run drops on Tikka, in plain words.</p>}
      sections={sections}
      other={{ href: "/privacy", label: "privacy policy" }}
    />
  );
}
