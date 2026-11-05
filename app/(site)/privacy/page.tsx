import type { Metadata } from "next";
import Link from "next/link";
import { Blank, LegalPage, type LegalSection } from "@/components/site/LegalPage";

// PRD C1 (Nigeria Data Protection Act 2023). LEGAL_PLACEHOLDER: a first draft written from what
// Tikka does today. Remove this marker (and set DRAFT to false) only once the lawyer-checked text
// is in; until then `pnpm build` on Vercel production refuses to ship (scripts/check-legal.ts).
const DRAFT = true;

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Tikka collects when you claim a Tikka or run drops, who sees it, and how to have it deleted.",
};

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          Tikka is run by <Blank>Tikka&apos;s registered company name</Blank>, <Blank>registered address</Blank>, Nigeria (&ldquo;Tikka&rdquo;, &ldquo;we&rdquo;). Businesses use Tikka to run
          drops: limited batches of Tikkas (digital cards with a reward inside) that people claim on WhatsApp and use at the business.
        </p>
        <p>
          For the details people give when they claim a business&apos;s Tikka, that business and Tikka each decide how some of it is used, as explained below. You can
          reach us about anything in this policy at <Blank>privacy email</Blank>.
        </p>
      </>
    ),
  },
  {
    id: "claim",
    title: "When you claim a Tikka",
    body: (
      <>
        <p>To give you your Tikka and let you use it, we collect:</p>
        <ul>
          <li>the first name you type in;</li>
          <li>your WhatsApp number and WhatsApp profile name, which come with the message you send to claim;</li>
          <li>which drop you claimed from, the Tikka you got and its code;</li>
          <li>where you came from (for example the business&apos;s Instagram, a QR poster or the Tikka marketplace);</li>
          <li>the day and time you plan to visit, if you pick one;</li>
          <li>when you used your Tikka and, if the business types it in, how much you spent;</li>
          <li>your review and star rating, if you leave one;</li>
          <li>whether you ticked &ldquo;Send me future drops&rdquo;.</li>
        </ul>
        <p>
          Claiming is free. We use these details to send your Tikka, let the business check and accept it at the counter, remind you before it runs out, and send
          the thank-you message after your visit.
        </p>
      </>
    ),
  },
  {
    id: "who-sees",
    title: "Who sees your details",
    body: (
      <>
        <ul>
          <li>
            <strong>The business you claimed from</strong> sees your first name, WhatsApp number and profile name, the Tikka you got, your visit plan, when you used it
            and what you spent. They can message you on WhatsApp from their own phone, and they may keep you on their customer list.
          </li>
          <li>
            <strong>The business&apos;s staff</strong> see your first name and Tikka at the counter when they check your code. They never see your phone number.
          </li>
          <li>
            <strong>Everyone</strong> can see reviews, shown with your first name and the first letter of your last name (for example &ldquo;Ada O.&rdquo;). Other
            visitors never see your number.
          </li>
          <li>
            <strong>Tikka</strong> staff can see these details to run the service and handle reports and requests.
          </li>
        </ul>
        <p>We don&apos;t sell your details, and we don&apos;t give them to other businesses.</p>
      </>
    ),
  },
  {
    id: "notify",
    title: "Notify me",
    body: (
      <p>
        If you ask to be told when a business drops again, we keep your WhatsApp number to send you that message. The business only ever sees how many people are
        waiting, never who. Asking to be notified doesn&apos;t make you one of the business&apos;s customers.
      </p>
    ),
  },
  {
    id: "studio",
    title: "Tikka Studio and Spark",
    body: (
      <p>
        If you ask Tikka Studio for help, we keep what you send (your name, business, WhatsApp number and what you need) to reply to you on WhatsApp. If you ask to hear
        about Spark first, we keep your email or WhatsApp number only to tell you when it&apos;s ready. Neither is shared with any business.
      </p>
    ),
  },
  {
    id: "messages",
    title: "WhatsApp messages and STOP",
    body: (
      <>
        <p>Tikka sends you WhatsApp messages about the Tikkas you claim: the Tikka itself, a reminder before it runs out, and a thank-you after your visit with a link to review it.</p>
        <p>
          A business&apos;s future drops only reach you if you ticked &ldquo;Send me future drops&rdquo; or asked to be notified. Reply <strong>STOP</strong> to Tikka on
          WhatsApp to stop messages from the business you last heard about, or <strong>STOP ALL</strong> to stop all Tikka messages. Claiming from that business again
          turns its messages back on.
        </p>
        <p>The business can also message you directly from its own WhatsApp. To stop those, tell the business, or block its number in WhatsApp.</p>
      </>
    ),
  },
  {
    id: "visits",
    title: "Counting visits without knowing who you are",
    body: (
      <>
        <p>
          When you open a drop, we count the visit so the business can see how many people looked, tore open a Tikka and claimed. To count each person once without
          knowing who they are, your browser keeps a random code, and we only store a scrambled version of it that changes every day. These counts never include
          your name or number.
        </p>
        <p>
          To stop anyone flooding a drop with fake claims, we also count how often each browser and internet address uses the claim, Notify me and report
          buttons. We only store a scrambled version of these, and throw the counts away after a day.
        </p>
        <p>We also use a few small cookies to keep the site working: the random code above, one to show your Tikka again if you come back to the drop, and your chosen city on the marketplace.</p>
      </>
    ),
  },
  {
    id: "businesses",
    title: "If you run a business on Tikka",
    body: (
      <>
        <p>
          We collect your name and email (or your Google account&apos;s name and email if you sign in with Google), your business&apos;s details, the WhatsApp number
          for your alerts and daily summary, your staff&apos;s emails, and your payments. Payments are handled by Paystack; we never see your card number.
        </p>
        <p>
          You decide how you use your customers&apos; details. You agree to use them only to follow up the people who claimed your Tikkas, to respect STOP, and not to
          sell or share them (see our <Link href="/terms" className="text-brand underline">terms</Link>).
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "If you sign in with Google",
    body: (
      <>
        <p>
          Business owners and staff can sign in to Tikka with their Google account. When you do, Google shares your name, email address and profile picture with
          Tikka, and nothing else: we don&apos;t ask for your contacts, Gmail, Drive, calendar or any other Google data.
        </p>
        <p>
          We use your name and email only to create your Tikka account, sign you in, show your name in your dashboard, and send you emails about your account (such
          as password and sign-in emails). We don&apos;t use your profile picture. Your Google sign-in details are stored with our sign-in provider, Supabase, along
          with the rest of your account.
        </p>
        <p>
          We don&apos;t sell your Google account data, share it with businesses or anyone else, use it for advertising, or use it to train AI models. Tikka&apos;s use
          of information received from Google follows the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-brand underline">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
        <p>
          You can stop Tikka&apos;s access at any time from your Google account&apos;s security settings (Third-party apps with account access). To delete your Tikka account
          and the details that come with it, contact us using the details in section 1 and we&apos;ll do it as described in &quot;Your rights&quot; below.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Services we use",
    body: (
      <>
        <p>We use these companies to run Tikka. They only use your details to provide their service to us.</p>
        <ul>
          <li>Supabase: our database, sign-in and file storage (<Blank>data location</Blank>).</li>
          <li>Vercel: hosts the website.</li>
          <li>Meta (WhatsApp Business Platform): sends and receives WhatsApp messages.</li>
          <li>Paystack: takes payments from businesses.</li>
          <li>Google: sign-in with Google for businesses, and the fonts on our pages.</li>
        </ul>
        <p>Some of these store data outside Nigeria. <Blank>How these transfers are protected under the NDPA, to be confirmed.</Blank></p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep things",
    body: (
      <p>
        We keep claim details for as long as the business uses Tikka and <Blank>retention period</Blank> after that, so the business can see its history and we can deal with
        questions. Visit counts never had names in them. When you ask us to delete your details, we do it as described below.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Nigeria Data Protection Act 2023 you can ask us to:</p>
        <ul>
          <li>tell you what we hold about you and give you a copy;</li>
          <li>correct anything that&apos;s wrong;</li>
          <li>delete your details;</li>
          <li>stop using them for messages you didn&apos;t ask for, or withdraw your consent at any time.</li>
        </ul>
        <p>
          To ask, email <Blank>privacy email</Blank> or message Tikka on WhatsApp, and tell us the WhatsApp number you claimed with. We&apos;ll reply within <Blank>response time</Blank>. If
          you&apos;re not happy with our answer, you can complain to the Nigeria Data Protection Commission.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Tikka is meant for people aged <Blank>minimum age</Blank> and over.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy in a way that matters, we&apos;ll update the date at the top and, for big changes, tell businesses by email.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={<Blank>date</Blank>}
      draft={DRAFT}
      intro={
        <p>
          This explains what Tikka collects when you claim a Tikka or run drops on Tikka, who can see it, and how to have it deleted. The short version: the business
          you claim from gets your first name and WhatsApp number so it can serve you and follow up after your visit; nobody else does; and you can reply STOP at any time.
        </p>
      }
      sections={sections}
      other={{ href: "/terms", label: "terms" }}
    />
  );
}
