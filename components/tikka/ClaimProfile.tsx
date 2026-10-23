"use client";

import { useState } from "react";
import { naira, place } from "@/lib/format";
import { formatTime } from "@/lib/setup";
import type { Business, OpeningHours, Tier } from "@/lib/types";
import { ACTION_LABEL, ActionIcon, actionHref } from "./ActionIcon";
import { RarityBadge } from "./RarityBadge";

// The business profile under the card on the claim page (design/card-reference/Main.dc.html):
// action buttons, "What's in this drop", and the Overview · Services · Reviews · Video tabs.
// Inline SVG icons, as in the reference, to keep the claim page's JavaScript small.

export function ActionsRow({
  actions,
  onServices,
  preview = false,
}: {
  actions: Business["actions"];
  onServices?: () => void;
  /** In the setup preview, buttons don't leave the page. */
  preview?: boolean;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="tk-actions" style={{ "--n": actions.length } as React.CSSProperties}>
      {actions.map((a) => {
        const href = actionHref(a.kind, a.value);
        if (!href || preview) {
          return (
            <button key={a.kind} type="button" className="tk-action" onClick={a.kind === "services" ? onServices : undefined}>
              <ActionIcon kind={a.kind} />
              {ACTION_LABEL[a.kind]}
            </button>
          );
        }
        return (
          <a key={a.kind} className="tk-action" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
            <ActionIcon kind={a.kind} />
            {ACTION_LABEL[a.kind]}
          </a>
        );
      })}
    </div>
  );
}

export interface DropItem {
  tier: Tier;
  count: number;
  reward: string;
}

export function DropContents({ items, note }: { items: DropItem[]; note: string }) {
  return (
    <div className="tk-box">
      <h3 className="tk-box-h">What&apos;s in this drop</h3>
      <ul className="tk-list">
        {items.map((it) => (
          <li key={it.tier + it.reward}>
            <span>
              <b>{it.count}×</b>
              {it.reward}
            </span>
            <RarityBadge tier={it.tier} />
          </li>
        ))}
      </ul>
      <p className="tk-fine">{note}</p>
    </div>
  );
}

export type ProfileTab = "overview" | "services" | "reviews" | "video";

const TABS: [ProfileTab, string][] = [
  ["overview", "Overview"],
  ["services", "Services"],
  ["reviews", "Reviews"],
  ["video", "Video"],
];

function hoursRows(h: OpeningHours): [string, string][] {
  const fmt = (d: OpeningHours["weekdays"]) => (d.open ? `${formatTime(d.from)} – ${formatTime(d.to)}` : "Closed");
  return [
    ["Mon – Fri", fmt(h.weekdays)],
    ["Saturday", fmt(h.saturday)],
    ["Sunday", fmt(h.sunday)],
  ];
}

function priceRange(services: Business["services"]): string | null {
  const prices = services.map((s) => s.price).filter((p): p is number => p !== null && p > 0);
  if (prices.length === 0) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? naira(lo) : `${naira(lo)} – ${naira(hi)}`;
}

export interface ReviewItem {
  name: string;
  text?: string;
  rating: number;
}

export function ProfileTabs({
  business,
  tab,
  onTab,
  reviews,
}: {
  business: Pick<Business, "name" | "about" | "hours" | "area" | "city" | "services" | "rating" | "reviewCount" | "hasVideo" | "videoPosterUrl"> &
    Partial<Pick<Business, "videoUrl">>;
  tab: ProfileTab;
  onTab: (t: ProfileTab) => void;
  reviews: ReviewItem[];
}) {
  const range = priceRange(business.services);
  return (
    <div>
      <div className="tk-tabs" role="tablist" aria-label={`About ${business.name}`}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tk-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`tk-panel-${id}`}
            className={tab === id ? "tk-tab on" : "tk-tab"}
            onClick={() => onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="tk-panel" role="tabpanel" id={`tk-panel-${tab}`} aria-labelledby={`tk-tab-${tab}`}>
        {tab === "overview" && (
          <>
            {business.about ? <p className="tk-about">{business.about}</p> : <p className="tk-about">{business.name} hasn&apos;t added an about yet.</p>}
            {business.hours &&
              hoursRows(business.hours).map(([k, v]) => (
                <div key={k} className="tk-row">
                  <span className="tk-row-k">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            <div className="tk-row">
              <span className="tk-row-k">Area</span>
              <span>{place(business.area, business.city)}</span>
            </div>
            {range && (
              <div className="tk-row">
                <span className="tk-row-k">Prices</span>
                <span>{range}</span>
              </div>
            )}
          </>
        )}

        {tab === "services" &&
          (business.services.length ? (
            business.services.map((s, i) => (
              <div key={i} className="tk-row">
                <span>{s.name}</span>
                <span className={s.price ? "" : "tk-row-k"}>{s.price ? naira(s.price) : s.price === 0 ? "Free" : "Price varies"}</span>
              </div>
            ))
          ) : (
            <p className="tk-about">No services listed yet.</p>
          ))}

        {tab === "reviews" && (
          <>
            <p className="tk-about">
              {business.reviewCount > 0
                ? `${business.rating} from ${business.reviewCount} people who used their Tikka here. Only people who redeemed a Tikka can review.`
                : "No reviews yet. Only people who redeem a Tikka here can review, so every review is from a real visit."}
            </p>
            {reviews.map((r, i) => (
              <div key={i} className="tk-review">
                <div className="tk-review-top">
                  <span>{r.name}</span>
                  <span className="tk-vtag">Used a Tikka</span>
                </div>
                {r.text && <p className="tk-review-text">{r.text}</p>}
              </div>
            ))}
          </>
        )}

        {tab === "video" && <VideoPanel business={business} />}
      </div>
    </div>
  );
}

/** Poster and play button first; the video itself loads only when tapped (preload="none"). */
function VideoPanel({ business }: { business: Pick<Business, "name" | "hasVideo" | "videoPosterUrl" | "videoUrl"> }) {
  const [playing, setPlaying] = useState(false);
  if (!business.hasVideo || !business.videoPosterUrl) {
    return (
      <div className="tk-video">
        <span>{business.name} hasn&apos;t added a video yet.</span>
      </div>
    );
  }
  if (playing && business.videoUrl) {
    return (
      <div className="tk-video">
        <video src={business.videoUrl} poster={business.videoPosterUrl} preload="none" autoPlay controls playsInline className="absolute inset-0 size-full object-cover" />
      </div>
    );
  }
  return (
    <button type="button" className="tk-video w-full border-0" onClick={() => setPlaying(true)} aria-label={`Play ${business.name}'s video`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={business.videoPosterUrl} alt="" loading="lazy" />
      <span className="tk-play">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
    </button>
  );
}
