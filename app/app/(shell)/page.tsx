import type { Metadata } from "next";
import { ArrowRight, Check, Share2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ComingIn } from "@/components/leads/ComingIn";
import { TodayCard } from "@/components/bookings/TodayCard";
import { TodayPage } from "@/components/today/TodayPage";
import { getBookings, getBookingSetup } from "@/lib/bookings-data";
import { todayKey, watInstant } from "@/lib/bookings";
import { comingIn } from "@/lib/followups";
import {
  ActivityFeed,
  ComingUp,
  HomeHeader,
  LiveDropPanel,
  NewLeads,
  FinishPageChecklist,
  TopStats,
} from "@/components/dashboard/Home";
import { BioCard } from "@/components/business/BioCard";
import { PaymentsCard } from "@/components/payments/PaymentsTeaser";
import { LeadAlertsCard } from "@/components/alerts/LeadAlerts";
import { pushConfigured } from "@/lib/push";
import { earlyAccessState } from "@/lib/studio-db";
import { paystackMode } from "@/lib/paystack";
import { dbPayoutState, type PayoutState } from "@/lib/payouts-db";
import { KycNotice } from "@/components/payments/KycNotice";
import { SoloCard } from "@/components/tikka/SoloCard";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import {
  getActivity,
  getBusiness,
  getDropReport,
  getDrops,
  getGuaranteeNotice,
  getLeads,
  leadsNow,
  isDbId,
} from "@/lib/data";
import { ClaimPrompt } from "@/components/dashboard/ClaimPrompt";
import { GuaranteeNotice } from "@/components/dashboard/GuaranteeNotice";
import { LastDropResults, SeasonalNudge } from "@/components/dashboard/RunAgain";
import { seasonalNudge } from "@/lib/nudges";
import { WAT } from "@/lib/format";
import { pageChecklist } from "@/lib/page";
import { getSessionUser } from "@/lib/session";
import type { Business } from "@/lib/types";
import { newExperience } from "@/lib/experience";

export const metadata: Metadata = { title: "Home" };

function sameDayWAT(a: string, b: Date) {
  const f = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: WAT });
  return f(new Date(a)) === f(b);
}

/** The deposits card: owners who haven't added the bank account payments go to, until they hide it. */
async function depositsCardShown(businessId: string, state: PayoutState | null): Promise<boolean> {
  const teaser = await earlyAccessState(businessId, "payments");
  if (teaser.dismissed.includes("payments_dashboard")) return false;
  return !(state?.payout && state.payout.mode === paystackMode());
}

async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  // Real accounts skip the old drops welcome tour: a new owner goes straight to the new setup.
  if (user.isNew && !isDbId(user.id)) redirect("/app/welcome");

  const [business, drops] = await Promise.all([getBusiness(user), getDrops(user)]);
  // No business yet: the new setup (real owners, and new-setup demo accounts).
  const demoNew = String(user.id).startsWith("user_demo_new_");
  if (!business && user.role === "owner" && (isDbId(user.id) || demoNew)) redirect("/app/start");
  // The new experience (every real business, docs/DB_MOVE.md step 8): owners open on Today.
  if (newExperience(business) && business && user.role === "owner") return <TodayPage user={user} business={business} />;
  const today = business && user.role === "owner" ? <TodayBookings user={user} /> : null;
  if (!business || drops.length === 0) return <GettingStarted name={user.name} business={business} today={today} />;

  // Staff never see leads (rule 4); getLeads refuses them.
  const owner = user.role === "owner";
  const payState = owner && isDbId(business.id) ? await dbPayoutState(business.id) : null;
  const [leads, activity, guarantee, payments] = await Promise.all([
    owner ? getLeads(user) : Promise.resolve([]),
    getActivity(user),
    owner ? getGuaranteeNotice(user) : Promise.resolve(null),
    owner ? depositsCardShown(business.id, payState) : Promise.resolve(false),
  ]);
  const live = drops.find((d) => d.status === "live");
  const renderedAt = new Date().toISOString();
  // The real clock for real businesses; the demo's data is frozen at DEMO_NOW.
  const now = await leadsNow(user);
  // When a drop ends: its results for two weeks, unless the next one is already running.
  const ended = drops.find((d) => d.status === "ended" || d.status === "sold_out");
  const recentEnd =
    owner && ended && !live && now.getTime() - new Date(ended.endsAt).getTime() < 14 * 86_400_000 ? await getDropReport(user, ended.id) : null;
  const scheduled = drops.find((d) => d.status === "scheduled");
  // "Run it again" only when nothing is running or lined up: not while the re-run is live.
  const nudge = owner && !live && !scheduled ? seasonalNudge(new Date(), ended ? { id: ended.id, name: ended.name, customers: ended.redeemed } : null) : null;
  const newToday = leads.filter((l) => l.isNew && sameDayWAT(l.claimedAt, now)).length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <HomeHeader name={user.name} now={now} />
      {owner && <ClaimPrompt since={renderedAt} />}
      {owner && <KycNotice state={payState} />}
      {/* New lead alerts on this phone: real owners only, once the keys are set (lib/push.ts). */}
      {owner && isDbId(business.id) && pushConfigured() && <LeadAlertsCard vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!} />}
      {guarantee && <GuaranteeNotice message={guarantee} />}
      {nudge && <SeasonalNudge text={nudge.text} fromId={nudge.fromId} />}
      {recentEnd && ended && <LastDropResults id={ended.id} name={ended.name} headline={recentEnd.headline} />}
      <TopStats drop={live} newToday={newToday} leadsTotal={live?.claimed ?? leads.length} />
      <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-6">
          {today}
          {live && <LiveDropPanel drop={live} business={business} now={now} />}
          {owner && <ComingIn days={comingIn(leads, now, 2)} more="/app/leads#coming-in" />}
          {owner && <NewLeads leads={leads} businessName={business.name} now={now} />}
        </div>
        <div className="grid gap-6">
          <ActivityFeed events={activity} now={now} />
          {payments && <PaymentsCard />}
          <BioCard slug={business.slug} name={business.name} />
          {scheduled && <ComingUp drop={scheduled} />}
          <FinishPageChecklist business={business} />
        </div>
      </div>
    </div>
  );
}

/** Today's bookings for Home (bookings use the real clock, the demo too). */
async function TodayBookings({ user }: { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }) {
  const setup = await getBookingSetup(user);
  if (!setup) return null;
  await connection();
  const day = todayKey(new Date());
  const list = setup.setUp ? await getBookings(user, new Date(watInstant(day, 0)), new Date(watInstant(day, 24 * 60))) : [];
  return <TodayCard setUp={setup.setUp} bookings={list} />;
}

function GettingStarted({ name, business, today }: { name: string; business: Business | null; today?: React.ReactNode }) {
  const cardDone = !!business;
  // After the card, the page comes next (most owners aren't ready for a drop yet); a drop stays one
  // tap away and becomes the next step once the page is finished. The page never blocks a drop.
  const pageItems = business ? pageChecklist(business) : [];
  const pageDone = pageItems.filter((i) => i.done).length;
  const pageFinished = cardDone && pageDone === pageItems.length;
  const steps: {
    title: string;
    body: string;
    href?: string;
    cta?: string;
    done: boolean;
    current: boolean;
    progress?: string;
    items?: { label: string; done: boolean }[];
    later?: { href: string; label: string };
  }[] = [
    {
      title: "Set up your card",
      body: cardDone ? "Done. Your digital business card: change it any time in Settings." : "Your digital business card, on the front of every Tikka. Logo, colour and how to reach you. About 3 minutes.",
      href: cardDone ? "/app/settings/card" : "/app/setup",
      cta: cardDone ? "Edit card" : "Set up your card",
      done: cardDone,
      current: !cardDone,
    },
    {
      title: "Finish your page",
      body: business
        ? `usetikka.com/${business.slug}: your services, prices, photos and bookings, ready for your Instagram and WhatsApp bio.`
        : "Your free website for your Instagram and WhatsApp bio: services, prices, photos and bookings.",
      href: "/app/page",
      cta: pageFinished ? "Edit your page" : "Finish your page",
      done: pageFinished,
      current: cardDone && !pageFinished,
      progress: cardDone && !pageFinished ? `${pageDone} of ${pageItems.length}` : undefined,
      items: cardDone && !pageFinished ? pageItems : undefined,
    },
    {
      title: "Create your first drop",
      body: pageFinished ? "How many Tikkas, what's inside, and when it ends. It's free." : "When you're ready. It's free.",
      href: "/app/drops/new",
      cta: "Create a drop",
      done: false,
      current: pageFinished,
      later: cardDone && !pageFinished ? { href: "/app/drops/new", label: "Create a drop now" } : undefined,
    },
    { title: "Share your link", body: "Wherever people see you: your status, Instagram bio, ads, or the QR at your counter.", done: false, current: false },
  ];
  const next = !cardDone ? "Four steps to your first drop." : pageFinished ? "Next, create your first drop." : "Next, finish your page. It's your free website for your bio.";
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <h1 className="text-heading">{cardDone ? `Nice card, ${name}` : `Welcome to Tikka, ${name}`}</h1>
        <p className="text-body-lg mt-2 text-ink-muted">
          {next}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-6">
          <ol className="grid gap-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={`flex gap-4 rounded-card border p-5 ${
                  s.current ? "border-brand bg-surface-raised shadow-raised" : "border-line bg-surface-raised"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-pill font-mono text-[13px] font-bold ${
                    s.done ? "bg-success text-on-success" : s.current ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted"
                  }`}
                >
                  {s.done ? <Check size={16} strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-title text-[17px] leading-6">{s.title}</h2>
                    {s.progress && <span className="text-caption shrink-0 text-ink-muted">{s.progress}</span>}
                  </div>
                  <p className="text-body mt-1 text-ink-muted">{s.body}</p>
                  {s.items && (
                    <ul className="mt-3 grid gap-2">
                      {s.items.map((i) => (
                        <li key={i.label} className={`text-body flex items-center gap-2.5 ${i.done ? "text-success" : ""}`}>
                          <span
                            className={`grid size-5 shrink-0 place-items-center rounded-pill ${i.done ? "bg-success text-on-success" : "border-[1.5px] border-line-strong"}`}
                          >
                            {i.done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                          </span>
                          {i.label}
                          <span className="sr-only">{i.done ? " (done)" : " (to do)"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.later && (
                    <Link href={s.later.href} className="text-label mt-1 inline-flex min-h-11 items-center text-brand hover:underline">
                      {s.later.label}
                    </Link>
                  )}
                  {s.href && (s.current || s.done) && (
                    <Link href={s.href} className={`btn mt-4 ${s.current ? "" : "btn-secondary"}`}>
                      {s.cta}
                      {s.current && <ArrowRight />}
                    </Link>
                  )}
                </div>
                {!s.href && <Share2 className="mt-1 shrink-0 text-ink-muted" size={20} aria-hidden="true" />}
              </li>
            ))}
          </ol>
          {today}
          {business && <BioCard slug={business.slug} name={business.name} />}
        </div>
        <div className="stage hidden flex-col items-center rounded-card bg-night px-8 py-8 lg:flex">
          <SoloCard
            zoom={0.8}
            face={
              business
                ? faceFromBusiness(business)
                : {
                    name: "Your business",
                    initials: "YB",
                    category: "Your category",
                    area: "Your area",
                    city: "Your city",
                    brandColor: "var(--brand)",
                    onBrandColor: "#FFFFFF",
                  }
            }
            total={50}
            label={business ? `${business.name}'s Tikka card` : "A preview of your Tikka card"}
          />
          <p className="text-caption mt-5 max-w-[220px] text-center text-on-night-muted">
            {business ? "This is your Tikka." : "This is your Tikka. Set up your card to make it yours."}
          </p>
        </div>
      </div>
      <ul className="text-label flex flex-wrap gap-x-6 gap-y-2 text-ink-muted">
        {["Your business page is free", "Your first drop is free", "Every claimer is yours to follow up"].map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <Check size={16} className="text-success" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true">
      <div className="h-16 w-64 rounded-md bg-surface-sunken" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-card bg-surface-sunken" />
        ))}
      </div>
      <div className="h-80 rounded-card bg-surface-sunken" />
    </div>
  );
}

export default function DashboardHome() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  );
}
