import type { Metadata } from "next";
import { Bell, ChevronLeft, ExternalLink, PartyPopper, RotateCcw, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AddTikkas } from "@/components/drops/AddTikkas";
import { ChannelLink } from "@/components/drops/ChannelLink";
import { PosterNudge } from "@/components/drops/PosterNudge";
import { DropActions } from "@/components/drops/DropActions";
import { LiveFeed } from "@/components/drops/LiveFeed";
import { ShareKit } from "@/components/drops/ShareKit";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { rate } from "@/lib/dashboard";
import { ResultsCard } from "@/components/drops/ResultsCard";
import { getBusiness, getDrop, getDropDashboard, getDropFeed, getDropReport, getDropTiers, getDrops, getPosters } from "@/lib/data";
import { LIMITS } from "@/lib/drop";
import { clockTime, count, nairaShort, percent, shortDate, timeLeft } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/leads";
import { rewardHook } from "@/lib/posters";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";
import type { Source } from "@/lib/types";

export const metadata: Metadata = { title: "Drop" };

const at = (iso: string) => `${shortDate(iso)}, ${clockTime(iso)}`;

/** The channel links people share (marketplace and direct have no link of their own). */
const CHANNELS: { c: Source; label: string }[] = [
  { c: "wa", label: "WhatsApp status" },
  { c: "ig", label: "Instagram" },
  { c: "qr", label: "QR code" },
  { c: "web", label: "Your website" },
  { c: "ads", label: "Ads" },
];

function Card({ title, children, id, className = "" }: { title: string; children: React.ReactNode; id: string; className?: string }) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface-raised p-4 sm:p-6 ${className}`} aria-labelledby={id}>
      <h2 id={id} className="text-title text-[17px] leading-6">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Dashboard({ params, searchParams }: { params: PageProps<"/app/drops/[id]">["params"]; searchParams: PageProps<"/app/drops/[id]">["searchParams"] }) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [business, found, stats, feed, tiers, report, posters, allDrops] = await Promise.all([
    getBusiness(user),
    getDrop(user, id),
    getDropDashboard(user, id),
    getDropFeed(user, id),
    getDropTiers(),
    getDropReport(user, id),
    getPosters(user),
    getDrops(user),
  ]);
  if (!business || !found) notFound();
  const { drop } = found;
  if (drop.status === "draft") redirect(`/app/drops/new?draft=${drop.id}`);
  if (!stats) notFound();

  const url = `${SITE}/d/${business.slug}/${drop.slug}`;
  // The counter poster (every business has one): it opens whatever drop is live.
  const poster = posters[0];
  const [qr, posterQr, ...channelQrs] = await Promise.all([
    qrSvg(`${url}?c=qr`),
    poster ? qrSvg(`${SITE}/q/${poster.code}`) : Promise.resolve(""),
    ...CHANNELS.map((ch) => qrSvg(`${url}?c=${ch.c}`)),
  ]);
  // Its line can carry this drop's best reward, but not while another drop is live: the poster
  // opens that one until this one starts.
  const otherLive = allDrops.some((d) => d.id !== drop.id && d.status === "live");
  const bestReward = otherLive ? undefined : (drop.rewards.find((r) => r.tier === "legendary")?.label ?? drop.rewards[0]?.label);
  const now = new Date();
  const justPublished = sp.published === "1";
  const added = Number(sp.added) || 0;
  const tier = tiers.find((t) => t.id === drop.tierId) ?? tiers.find((t) => t.maxCards >= drop.total);
  const running = drop.status === "live" || drop.status === "scheduled";
  const left = Math.max(0, drop.total - drop.claimed);
  const maxEndsAt = new Date(new Date(drop.startsAt).getTime() + LIMITS.maxDays * 86_400_000).toISOString();
  const imgQuery = `b=${encodeURIComponent(business.slug)}&d=${encodeURIComponent(drop.slug)}`;
  const sourceRows = [
    ...CHANNELS.map((ch, i) => ({ ...ch, qr: channelQrs[i], ...(stats.bySource.find((s) => s.source === ch.c) ?? { views: 0, claims: 0 }) })),
    ...stats.bySource.filter((s) => !CHANNELS.some((ch) => ch.c === s.source)).map((s) => ({ c: s.source, label: SOURCE_LABEL[s.source], qr: "", ...s })),
  ];
  const maxStep = Math.max(1, ...stats.funnel.map((s) => s.count));

  const headline: [string, string, string?][] = [
    drop.revenue > 0 ? ["This drop brought in", nairaShort(drop.revenue), `from ${count(drop.redeemed)} redemptions`] : ["Redeemed", count(drop.redeemed), "No spend logged yet"],
    ["Claims", count(drop.claimed), `${percent(drop.claimed, drop.total)} of the drop`],
    ["Tikkas left", drop.status === "scheduled" ? count(drop.total) : `${count(left)} of ${count(drop.total)}`],
    drop.status === "scheduled"
      ? ["Opens", at(drop.startsAt)]
      : drop.status === "ended"
        ? ["Ended", at(drop.endsAt)]
        : ["Time left", timeLeft(drop.endsAt, now), `Ends ${at(drop.endsAt)}`],
  ];

  return (
    <>
      {justPublished && (
        <div className="flex items-start gap-3 rounded-card bg-success-soft p-4 text-ink">
          <PartyPopper size={22} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-title text-[17px] leading-6">{drop.status === "scheduled" ? "Your drop is scheduled" : "Your drop is live"}</p>
            <p className="text-body mt-0.5 text-ink-muted">
              {drop.status === "scheduled"
                ? `It opens ${at(drop.startsAt)}. Share the link now so people can tap Notify me.`
                : "Share the link below. Every claim shows up in your leads as it happens."}
            </p>
          </div>
        </div>
      )}
      {added > 0 && (
        <div className="flex items-start gap-3 rounded-card bg-success-soft p-4 text-ink" role="status">
          <PartyPopper size={22} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-body">
            <b>{count(added)} Tikkas added.</b> They&apos;re at the end of the drop, in the same mix. {count(drop.total)} in all now.
          </p>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-caption inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-semibold ${
              drop.status === "live" ? "bg-success-soft text-success" : drop.status === "scheduled" ? "bg-brand-soft text-brand" : "bg-surface-sunken text-ink-muted"
            }`}
          >
            {drop.status === "live" && <span className="size-1.5 rounded-pill bg-success" aria-hidden="true" />}
            {drop.status === "live" ? "Live" : drop.status === "scheduled" ? "Scheduled" : drop.status === "sold_out" ? "Sold out" : "Ended"}
          </span>
          <span className="text-caption text-ink-muted">
            {tier ? `${tier.label} · up to ${count(tier.maxCards)}` : ""}
          </span>
        </div>
        <h1 className="text-heading mt-2">{drop.name}</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Headline numbers">
        {headline.map(([k, v, note], i) => (
          <div key={k} className={`rounded-card border p-4 ${i === 0 && drop.revenue > 0 ? "border-gold/40 bg-gold-soft" : "border-line bg-surface-raised"}`}>
            <div className="text-caption text-ink-muted">{k}</div>
            <div className="text-title mt-1 tabular-nums">{v}</div>
            {note && <div className="text-caption mt-0.5 text-ink-muted">{note}</div>}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {drop.status !== "ended" && tier && <AddTikkas dropId={drop.id} total={drop.total} tier={tier} tiers={tiers} />}
        {running && <DropActions dropId={drop.id} startsAt={drop.startsAt} endsAt={drop.endsAt} maxEndsAt={maxEndsAt} />}
        <Link href={`/app/drops/new?from=${drop.id}`} className="btn btn-ghost">
          <RotateCcw />
          Run it again
        </Link>
        <Link href={`/d/${business.slug}/${drop.slug}`} target="_blank" className="btn btn-ghost">
          <ExternalLink />
          Claim page
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-5">
          <div className="lg:hidden">
            <LiveFeed dropId={drop.id} initial={feed ?? []} now={now.toISOString()} live={drop.status === "live"} />
          </div>

          {report && drop.status !== "scheduled" && <ResultsCard report={report} />}

          <Card title="Where people drop off" id="funnel-h">
            <ol className="mt-4 grid gap-3">
              {stats.funnel.map((s) => (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body">{s.label}</span>
                    <span className="text-label shrink-0 tabular-nums">
                      {count(s.count)}
                      {s.ofPrev !== null && <span className="ml-1.5 font-normal text-ink-muted">{s.ofPrev}%</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.max(1, (s.count / maxStep) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-caption mt-3 text-ink-muted">
              {count(stats.uniqueViews)} people opened the link ({count(stats.viewTotal)} visits). Each % is of the step before.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-surface-sunken p-3">
                <dt className="text-caption text-ink-muted">Opened but didn&apos;t claim</dt>
                <dd className="text-title mt-0.5 tabular-nums">{count(stats.openedNotClaimed)}</dd>
              </div>
              <div className="rounded-md bg-surface-sunken p-3">
                <dt className="text-caption text-ink-muted">New · returning</dt>
                <dd className="text-title mt-0.5 tabular-nums">
                  {count(stats.newClaimers)} · {count(stats.returningClaimers)}
                </dd>
              </div>
            </dl>
            {stats.afterSellout && stats.afterSellout.viewers > 0 && (
              <p className="text-label mt-3 flex items-start gap-2 rounded-md bg-gold-soft px-3 py-2.5 font-medium text-ink">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-gold-text" aria-hidden="true" />
                <span>
                  {count(stats.afterSellout.viewers)} people opened it after it sold out. Next time, try {count(stats.afterSellout.suggest)} Tikkas.
                </span>
              </p>
            )}
            {stats.notifyWaiting > 0 && (
              <p className="text-label mt-3 flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 font-medium text-ink">
                <Bell size={18} className="shrink-0 text-brand" aria-hidden="true" />
                {count(stats.notifyWaiting)} people asked to be told when this drop opens.
              </p>
            )}
          </Card>

          <Card title="By source" id="source-h">
            <p className="text-caption mt-1 text-ink-muted">Share the matching link in each place, and see which one brings people in.</p>
            <ul className="mt-3 divide-y divide-line">
              {sourceRows.map((r) => (
                <li key={r.c} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold">{r.label}</div>
                    <div className="text-caption text-ink-muted tabular-nums">
                      {count(r.views)} opened · {count(r.claims)} claimed · {rate(r.claims, r.views)}
                    </div>
                  </div>
                  {r.qr && <ChannelLink url={`${url}?c=${r.c}`} label={r.label} qrSvg={r.qr} />}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Tikkas left by reward" id="left-h">
            <ul className="mt-3 grid gap-3">
              {stats.rewardsLeft.map((r, i) => (
                <li key={i} className="grid gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <RarityBadge tier={r.tier} />
                      <span className="text-body min-w-0">{r.label}</span>
                    </span>
                    <span className="text-label tabular-nums">
                      {count(r.left)} of {count(r.total)} left
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
                    <div className="h-full rounded-pill bg-success" style={{ width: percent(r.left, r.total, 2) }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid min-w-0 gap-5">
          <div className="hidden lg:block">
            <LiveFeed dropId={drop.id} initial={feed ?? []} now={now.toISOString()} live={drop.status === "live"} />
          </div>
          {running && (
            <Card title="Share your drop" id="share-h">
              <div className="mt-4">
                <ShareKit
                  url={url}
                  qrSvg={qr}
                  title={`${business.name}: ${drop.name}`}
                  fileName={drop.slug}
                  images={{ status: `/api/og/status?${imgQuery}`, square: `/api/og/square?${imgQuery}` }}
                  poster={
                    poster && (
                      <PosterNudge
                        b={business}
                        poster={poster}
                        qr={posterQr}
                        suggestion={rewardHook(bestReward)}
                        opensAt={drop.status === "scheduled" ? drop.startsAt : undefined}
                      />
                    )
                  }
                />
              </div>
              {drop.showOnMarketplace !== false && (
                <p className="text-label mt-4 flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2.5 font-medium text-ink">
                  <Store size={18} className="shrink-0 text-brand" aria-hidden="true" />
                  {drop.status === "scheduled" ? "Your drop shows as Coming soon on the marketplace." : "Your drop is on the marketplace, where people across Nigeria can find it."}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function DropPage(props: PageProps<"/app/drops/[id]">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-8">
      <Link href="/app/drops" className="text-label -ml-2 inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md px-2 text-brand">
        <ChevronLeft size={18} aria-hidden="true" />
        Drops
      </Link>
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Dashboard params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
