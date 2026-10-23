import type { Metadata } from "next";
import { ArrowRight, Check, Share2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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
import { SoloCard } from "@/components/tikka/SoloCard";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import {
  DEMO_NOW,
  getActivity,
  getBusiness,
  getDropReport,
  getDrops,
  getGuaranteeNotice,
  getLeads,
} from "@/lib/data";
import { ClaimPrompt } from "@/components/dashboard/ClaimPrompt";
import { GuaranteeNotice } from "@/components/dashboard/GuaranteeNotice";
import { LastDropResults, SeasonalNudge } from "@/components/dashboard/RunAgain";
import { seasonalNudge } from "@/lib/nudges";
import { WAT } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import type { Business } from "@/lib/types";

export const metadata: Metadata = { title: "Home" };

function sameDayWAT(a: string, b: Date) {
  const f = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: WAT });
  return f(new Date(a)) === f(b);
}

async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.isNew) redirect("/app/welcome");

  const [business, drops] = await Promise.all([getBusiness(user), getDrops(user)]);
  if (!business || drops.length === 0) return <GettingStarted name={user.name} business={business} />;

  // Staff never see leads (rule 4); getLeads refuses them.
  const owner = user.role === "owner";
  const [leads, activity, guarantee] = await Promise.all([
    owner ? getLeads(user) : Promise.resolve([]),
    getActivity(user),
    owner ? getGuaranteeNotice(user) : Promise.resolve(null),
  ]);
  const live = drops.find((d) => d.status === "live");
  const renderedAt = new Date().toISOString();
  // When a drop ends: its results for two weeks, unless the next one is already running.
  const ended = drops.find((d) => d.status === "ended" || d.status === "sold_out");
  const recentEnd =
    owner && ended && !live && DEMO_NOW.getTime() - new Date(ended.endsAt).getTime() < 14 * 86_400_000 ? await getDropReport(user, ended.id) : null;
  const nudge = owner ? seasonalNudge(new Date(), ended ? { id: ended.id, name: ended.name, customers: ended.redeemed } : null) : null;
  const scheduled = drops.find((d) => d.status === "scheduled");
  const newToday = leads.filter((l) => l.isNew && sameDayWAT(l.claimedAt, DEMO_NOW)).length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <HomeHeader name={user.name} now={DEMO_NOW} />
      {owner && <ClaimPrompt since={renderedAt} />}
      {guarantee && <GuaranteeNotice message={guarantee} />}
      {nudge && <SeasonalNudge text={nudge.text} fromId={nudge.fromId} />}
      {recentEnd && ended && <LastDropResults id={ended.id} name={ended.name} headline={recentEnd.headline} />}
      <TopStats drop={live} newToday={newToday} leadsTotal={live?.claimed ?? leads.length} />
      <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-6">
          {live && <LiveDropPanel drop={live} business={business} now={DEMO_NOW} />}
          {owner && <NewLeads leads={leads} businessName={business.name} now={DEMO_NOW} />}
        </div>
        <div className="grid gap-6">
          <ActivityFeed events={activity} now={DEMO_NOW} />
          <BioCard slug={business.slug} name={business.name} />
          {scheduled && <ComingUp drop={scheduled} />}
          <FinishPageChecklist business={business} />
        </div>
      </div>
    </div>
  );
}

function GettingStarted({ name, business }: { name: string; business: Business | null }) {
  const cardDone = !!business;
  const steps = [
    {
      title: "Set up your card",
      body: cardDone ? "Done. You can change it any time in Settings." : "Logo, colour and one action button. About 3 minutes.",
      href: cardDone ? "/app/settings/card" : "/app/setup",
      cta: cardDone ? "Edit card" : "Set up your card",
      done: cardDone,
      current: !cardDone,
    },
    {
      title: "Create your first drop",
      body: "How many Tikkas, what's inside, and when it ends.",
      href: "/app/drops/new",
      cta: "Create a drop",
      done: false,
      current: cardDone,
    },
    { title: "Share your link", body: "Wherever people see you: your status, Instagram bio, ads, or the QR at your counter.", done: false, current: false },
  ];
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <h1 className="text-heading">{cardDone ? `Nice card, ${name}` : `Welcome to Tikka, ${name}`}</h1>
        <p className="text-body-lg mt-2 text-ink-muted">
          {cardDone ? "Next, create your first drop." : "Three steps to your first drop."}
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
                  <h2 className="text-title text-[17px] leading-6">{s.title}</h2>
                  <p className="text-body mt-1 text-ink-muted">{s.body}</p>
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
          {business && <BioCard slug={business.slug} name={business.name} />}
          {business && <FinishPageChecklist business={business} />}
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
            total={500}
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
