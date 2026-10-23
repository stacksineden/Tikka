import { Bell, Flame, Gem, MapPin, Sparkles, Star, Store, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { Spark } from "@/components/tikka/glyphs";
import { clockTime, count, place, shortDate, timeAgo } from "@/lib/format";
import { categorySlug, type MarketClaim, type MarketStats } from "@/lib/market";
import type { MarketDrop, MarketPin } from "@/lib/types";
import { Countdown } from "./Countdown";
import { NotifyMe } from "./NotifyMe";

// The marketplace home's pieces (PRD A5): busy, live and server-rendered. Only the countdowns,
// the ranking tabs and Notify me run JavaScript.

const pct = (d: Pick<MarketDrop, "claimed" | "total">) => Math.round((d.claimed / d.total) * 100);
const claimHref = (d: Pick<MarketDrop, "businessSlug" | "dropSlug">) => `/d/${d.businessSlug}/${d.dropSlug}?c=market`;

/** The sealed wrapper in miniature, in the business's colours. `size` is its height in px. */
export function MiniWrapper({ d, size = 118 }: { d: Pick<MarketDrop, "initials" | "brandColor" | "onBrandColor">; size?: number }) {
  const s = size / 118;
  return (
    <div className="relative shrink-0 rounded-[10px] bg-brand shadow-card" style={{ height: size, width: 86 * s, borderRadius: 10 * s }} aria-hidden="true">
      <div className="absolute inset-x-0 border-t border-dashed border-on-night/60" style={{ top: 18 * s }} />
      <Spark className="absolute left-1/2 -translate-x-1/2 text-gold" style={{ top: 30 * s, width: 32 * s, height: 32 * s }} />
      <div
        className="absolute grid -rotate-12 place-items-center rounded-pill border-2 border-on-night font-extrabold"
        style={{ right: -12 * s, top: 64 * s, width: 36 * s, height: 36 * s, fontSize: 11 * s, background: d.brandColor, color: d.onBrandColor }}
      >
        {d.initials}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- ticker */

const TIER_WORD: Record<MarketClaim["tier"], string> = { legendary: "Legendary", rare: "Rare", thank_you: "Thank-you" };

export function Ticker({ claims, now }: { claims: MarketClaim[]; now: Date }) {
  if (claims.length === 0) return null;
  const item = (c: MarketClaim, k: string) => (
    <Link key={k} href={claimHref(c)} className="flex shrink-0 items-center gap-2 px-4 text-[13px] text-on-night-muted hover:text-on-night">
      <span className={`size-2 rounded-pill ${c.tier === "legendary" ? "bg-rarity-legendary" : c.tier === "rare" ? "bg-rarity-rare" : "bg-rarity-common"}`} aria-hidden="true" />
      {/* No names: the person never agreed to be shown publicly. */}
      <span>
        {/^[aeiou]/i.test(TIER_WORD[c.tier]) ? "An" : "A"} <b className="font-semibold text-on-night">{TIER_WORD[c.tier]}</b> Tikka was just claimed at{" "}
        <b className="font-semibold text-on-night">{c.businessName}</b>
      </span>
      <span className="opacity-70">· {place(c.area, c.city)} · {timeAgo(c.at, now)}</span>
    </Link>
  );
  return (
    <div className="overflow-hidden border-b border-night-raised py-2.5" aria-label="Just claimed">
      <div className="ticker">
        <div className="flex">{claims.map((c) => item(c, c.id))}</div>
        <div className="flex" aria-hidden="true">
          {claims.map((c) => item(c, `${c.id}-b`))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- featured */

export function Featured({ items, now }: { items: { pin: MarketPin; d: MarketDrop }[]; now: Date }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0" aria-label="Featured drops">
      {items.map(({ pin, d }) => {
        const live = d.status === "live";
        return (
          <li key={d.id} className="w-[88%] shrink-0 snap-start sm:w-[calc(50%-6px)] lg:w-[calc(50%-6px)]">
            <article className="relative h-full overflow-hidden rounded-[24px] text-on-night" style={{ background: d.brandColor }}>
              <div className="absolute -right-16 -top-16 size-56 rounded-pill bg-[rgba(255,255,255,.12)]" aria-hidden="true" />
              <div className="absolute -bottom-20 -left-10 size-48 rounded-pill bg-[rgba(0,0,0,.18)]" aria-hidden="true" />
              <div className="relative grid gap-4 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-night/70 px-2.5 py-1 text-[12px] font-semibold backdrop-blur">
                    <Sparkles size={14} className="text-gold" aria-hidden="true" />
                    {pin.headline}
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-pill bg-night/70 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] backdrop-blur">
                    {live ? "Live" : `Opens ${shortDate(d.startsAt)}`}
                  </span>
                </div>
                <div className="flex items-end gap-4">
                  <MiniWrapper d={d} size={150} />
                  <div className="min-w-0 pb-1">
                    <p className="text-caption opacity-80">
                      {d.businessName} · {place(d.area, d.city)}
                    </p>
                    <h3 className="text-heading leading-tight" style={{ color: d.onBrandColor }}>
                      {d.dropName}
                    </h3>
                  </div>
                </div>
                <p className="text-body opacity-90">{pin.blurb}</p>
                <dl className="grid grid-cols-3 gap-2 rounded-card bg-night/60 p-3 backdrop-blur">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] opacity-70">{live ? "Left" : "Tikkas"}</dt>
                    <dd className="font-mono text-[15px] font-bold">{live ? `${count(d.left)}/${count(d.total)}` : count(d.total)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] opacity-70">Legendary</dt>
                    <dd className="font-mono text-[15px] font-bold">{live ? `${count(d.legendaryLeft)} left` : count(d.legendary)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] opacity-70">{live ? "Ends in" : "Opens in"}</dt>
                    <dd className="text-[15px] font-bold">
                      <Countdown to={live ? d.endsAt : d.startsAt} from={now.toISOString()} />
                    </dd>
                  </div>
                </dl>
                {live && (
                  <div>
                    <div className="h-2 overflow-hidden rounded-pill bg-night/50" aria-hidden="true">
                      <div className="h-full rounded-pill bg-on-night" style={{ width: `${pct(d)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[12px] opacity-80">
                      {pct(d)}% claimed · +{count(d.claimsLastHour)} this hour
                    </p>
                  </div>
                )}
                {live ? (
                  <Link href={claimHref(d)} className="btn btn-lg w-full bg-gold text-on-gold">
                    Open your Tikka
                  </Link>
                ) : (
                  <NotifyMe
                    businessSlug={d.businessSlug}
                    businessName={d.businessName}
                    dropSlug={d.dropSlug}
                    opensLabel={`${shortDate(d.startsAt)}, ${clockTime(d.startsAt)}`}
                    className="btn btn-lg w-full bg-on-night text-night"
                  >
                    <Bell />
                    Notify me · {count(d.waiting)} waiting
                  </NotifyMe>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- stats */

export function StatStrip({ stats }: { stats: MarketStats }) {
  const items: [ReactNode, string, string][] = [
    [<Flame key="i" size={18} aria-hidden="true" />, count(stats.live), "drops live now"],
    [<TrendingUp key="i" size={18} aria-hidden="true" />, count(stats.claimedToday), "Tikkas claimed today"],
    [<Gem key="i" size={18} aria-hidden="true" />, count(stats.legendaryLeft), "legendary still out there"],
    [<Users key="i" size={18} aria-hidden="true" />, count(stats.waiting), "waiting for drops to open"],
    [<MapPin key="i" size={18} aria-hidden="true" />, count(stats.cities), "cities live"],
  ];
  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0" aria-label="Marketplace right now">
      {items.map(([icon, value, label]) => (
        <li key={label} className="min-w-[150px] shrink-0 rounded-card border border-night-raised bg-night-raised/60 p-3 text-on-night sm:min-w-0">
          <div className="flex items-center gap-1.5 text-on-night-muted">{icon}</div>
          <div className="mt-1 font-mono text-[22px] font-bold leading-7 tabular-nums">{value}</div>
          <div className="text-[12px] leading-4 text-on-night-muted">{label}</div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- rankings */

export function RankList({ drops, now, metric }: { drops: MarketDrop[]; now: Date; metric: "hour" | "day" | "ends" | "new" }) {
  if (drops.length === 0) return <p className="text-body py-6 text-ink-muted">Nothing here right now.</p>;
  return (
    <ol className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
      {drops.slice(0, 10).map((d, i) => (
        <li key={d.id}>
          <Link href={claimHref(d)} className="grid grid-cols-[22px_44px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-surface-sunken sm:grid-cols-[28px_44px_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
            <span className={`text-label text-center font-mono ${i < 3 ? "text-ink" : "text-ink-muted"}`}>{i + 1}</span>
            <span className="grid size-11 place-items-center rounded-md" style={{ background: d.brandColor }}>
              <MiniWrapper d={d} size={34} />
            </span>
            <span className="min-w-0">
              <span className="text-body block truncate font-semibold">{d.businessName}</span>
              <span className="text-caption block truncate text-ink-muted">
                {d.dropName} · {d.city}
              </span>
            </span>
            {/* phones: one number; wider: three columns */}
            <span className="text-right sm:hidden">
              <span className="text-label block tabular-nums">
                {metric === "ends" ? <Countdown to={d.endsAt} from={now.toISOString()} /> : metric === "day" ? count(d.claims24h) : `+${count(d.claimsLastHour)}`}
              </span>
              <span className="text-caption block text-ink-muted">{metric === "ends" ? "left" : metric === "day" ? "today" : metric === "new" ? `${pct(d)}% claimed` : "this hour"}</span>
            </span>
            <span className="hidden text-right sm:block">
              <span className="text-label block tabular-nums text-success">+{count(d.claimsLastHour)}</span>
              <span className="text-caption block text-ink-muted">this hour</span>
            </span>
            <span className="hidden text-right sm:block">
              <span className="text-label block tabular-nums">{count(d.claims24h)}</span>
              <span className="text-caption block text-ink-muted">today</span>
            </span>
            <span className="hidden sm:block">
              <span className="text-label flex justify-end tabular-nums">{pct(d)}%</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
                <span className="block h-full rounded-pill bg-brand" style={{ width: `${pct(d)}%` }} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------------- rows */

export function Rail({ title, icon, subtitle, href, children }: { title: string; icon?: ReactNode; subtitle?: string; href?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="text-caption text-ink-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="text-label shrink-0 text-brand">
            See all
          </Link>
        )}
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0">{children}</ul>
    </section>
  );
}

export function CategoryGrid({ counts }: { counts: { category: string; live: number }[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {counts.map((c) => (
        <li key={c.category}>
          <Link href={`/drops/${categorySlug(c.category)}`} className="grid h-full content-between gap-2 rounded-card border border-line bg-surface-raised p-3 hover:border-brand">
            <span className="text-label leading-tight">{c.category}</span>
            <span className="text-caption text-ink-muted">{c.live > 0 ? `${c.live} live` : "Soon"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TopCities({ cities }: { cities: { city: string; live: number; claimedToday: number }[] }) {
  const max = Math.max(1, ...cities.map((c) => c.claimedToday));
  return (
    <ol className="grid gap-2">
      {cities.map((c, i) => (
        <li key={c.city} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3">
          <span className="text-label text-center font-mono text-ink-muted">{i + 1}</span>
          <span className="min-w-0">
            <span className="text-body flex items-center justify-between gap-2 font-semibold">
              {c.city}
              <span className="text-caption font-normal text-ink-muted">{c.live} live</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
              <span className="block h-full rounded-pill bg-brand" style={{ width: `${(c.claimedToday / max) * 100}%` }} />
            </span>
          </span>
          <span className="text-label w-14 text-right tabular-nums">{count(c.claimedToday)}</span>
        </li>
      ))}
    </ol>
  );
}

export function TopBusinesses({ items }: { items: ReturnType<typeof import("@/lib/market").topBusinesses> }) {
  return (
    <ol className="grid gap-1">
      {items.slice(0, 5).map((b, i) => (
        <li key={b.slug}>
          <Link href={`/${b.slug}`} className="grid grid-cols-[22px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-2 hover:bg-surface-sunken">
            <span className="text-label text-center font-mono text-ink-muted">{i + 1}</span>
            <span className="grid size-10 place-items-center rounded-pill text-[13px] font-extrabold" style={{ background: b.brandColor, color: b.onBrandColor }} aria-hidden="true">
              {b.initials}
            </span>
            <span className="min-w-0">
              <span className="text-body block truncate font-semibold">{b.name}</span>
              <span className="text-caption flex items-center gap-1 text-ink-muted">
                {b.rating ? (
                  <>
                    <Star size={12} className="fill-gold text-gold" aria-hidden="true" />
                    {b.rating} ·
                  </>
                ) : null}{" "}
                {b.place}
              </span>
            </span>
            <span className="text-right">
              <span className="text-label block tabular-nums">{count(b.claimedToday)}</span>
              <span className="text-caption block text-ink-muted">today</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function JustClaimed({ claims, now }: { claims: MarketClaim[]; now: Date }) {
  return (
    <ol className="grid gap-1" aria-label="Just claimed">
      {claims.slice(0, 6).map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-md px-1 py-2">
          <RarityBadge tier={c.tier} />
          <span className="text-body min-w-0 flex-1 truncate">
            <b className="font-semibold">{c.businessName}</b> · {c.area}
          </span>
          <span className="text-caption shrink-0 text-ink-muted">{timeAgo(c.at, now)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SellBand() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[24px] bg-night p-6 text-on-night sm:flex-row sm:items-center sm:justify-between" data-theme="light">
      <div className="flex items-start gap-3">
        <Store className="mt-1 shrink-0 text-on-night-muted" aria-hidden="true" />
        <div>
          <h2 className="text-title">Put your business on the marketplace</h2>
          <p className="text-body mt-1 text-on-night-muted">People across Nigeria find drops here every day. Your first drop and your business page are free.</p>
        </div>
      </div>
      <Link href="/sign-up" className="btn btn-paper shrink-0">
        Start free
      </Link>
    </section>
  );
}
