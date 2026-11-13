"use client";

import { Smartphone, X } from "lucide-react";
import { useRef, useState } from "react";
import { DropContents, ProfileTabs, ActionsRow, type DropItem, type ProfileTab, type ReviewItem } from "@/components/tikka/ClaimProfile";
import { Tick } from "@/components/tikka/glyphs";
import { TikkaCard, type CardFace } from "@/components/tikka/TikkaCard";
import { count } from "@/lib/format";
import type { Business, Finish, Tier } from "@/lib/types";

/** What the claim page needs about the business, from a setup draft or a saved business. */
export type PreviewBusiness = Pick<
  Business,
  "name" | "about" | "hours" | "area" | "city" | "services" | "actions" | "rating" | "reviewCount" | "hasVideo" | "videoPosterUrl"
> &
  /** So the owner can play their video in the preview, as customers will. */
  Partial<Pick<Business, "videoUrl">>;

const SAMPLE_TOTAL = 500;
const SAMPLE_LEFT = 23;
// Sample drop: the real rewards come from the drop builder.
const SAMPLE_DROP: DropItem[] = [
  { tier: "legendary", count: 10, reward: "Your top reward" },
  { tier: "rare", count: 50, reward: "20% off any service" },
  { tier: "thank_you", count: 440, reward: "Priority booking" },
];

/**
 * The whole claim page as a claimer sees it on their phone: before claiming (card front,
 * buttons, what's in the drop, tabs) and after (the flipped card with its code).
 */
export interface PreviewDrop {
  total: number;
  left: number;
  items: DropItem[];
  note: string;
  finish?: Finish;
  /** Scheduled drops: "Opens Sat 14 Dec, 9am" replaces the counter and claim button. */
  opensLabel?: string;
  /** The reward shown after the flip. */
  sample?: { tier: Tier; reward: string };
  /** When the drop's Tikkas expire, e.g. "Tue 3 Nov". */
  expiry?: string;
}

export function ClaimPreview({
  face,
  business,
  prefix,
  reviews = [],
  drop,
}: {
  face: CardFace;
  business: PreviewBusiness;
  prefix: string;
  reviews?: ReviewItem[];
  drop?: PreviewDrop;
}) {
  const TOTAL = drop?.total ?? SAMPLE_TOTAL;
  const LEFT = drop?.left ?? SAMPLE_LEFT;
  const items = drop?.items ?? SAMPLE_DROP;
  const note = drop?.note ?? "Sample rewards: you choose these when you create a drop.";
  const shown = drop?.sample ?? { tier: "rare" as Tier, reward: "20% off any service" };
  const expiry = drop?.expiry ?? "Sun 31 Dec";
  const low = LEFT / TOTAL < 0.1;
  const [after, setAfter] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const code = `${prefix || "XX"}-7X4QP`;

  return (
    <div className="grid gap-3">
      <div className="flex gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup" aria-label="Preview">
        {[
          [false, "Before claim"],
          [true, "After claim"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={after === value}
            onClick={() => setAfter(value as boolean)}
            className={`text-label min-h-11 flex-1 rounded-md ${after === value ? "bg-surface-raised text-ink shadow-raised" : "text-ink-muted"}`}
          >
            {label as string}
          </button>
        ))}
      </div>

      <div className="claim-preview-fit mx-auto">
        <div
          data-theme="light"
          className="tk-claim h-[760px] w-[390px] overflow-y-auto overflow-x-hidden rounded-[36px] border-[6px] border-ink [scrollbar-width:none]"
          aria-label={`Preview of ${business.name || "your"} claim page, ${after ? "after claiming" : "before claiming"}`}
          role="region"
        >
          <div className="tk-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={75} height={22} />
            {after ? (
              <span className="counter">
                <span>
                  No. <b>0412</b> / {TOTAL}
                </span>
              </span>
            ) : drop?.opensLabel ? (
              <span className="counter">
                <span>{drop.opensLabel}</span>
              </span>
            ) : (
              <span className={`counter ${low ? "counter--low" : ""}`}>
                <span className="counter__dot" />
                <span>
                  <b>{count(LEFT)}</b> of {count(TOTAL)} left
                </span>
              </span>
            )}
          </div>

          <div className={`tk-cardstage ${after ? "is-flipped is-revealed" : ""}`}>
            <TikkaCard
              face={face}
              total={TOTAL}
              finish={drop?.finish ?? "foil"}
              claimedBy={after ? "Adaeze" : undefined}
              reveal={{ tier: shown.tier, reward: shown.reward, code, expiry: expiry.replace(/^\w+ /, ""), serial: "0412", claimer: "Adaeze" }}
            />
          </div>

          {after ? (
            <>
              <div className="tk-section">
                <div className="tk-redeem">
                  <div className="tk-redeem-h">Show this at the counter</div>
                  <div className="tk-redeem-code">{code}</div>
                  <div className="tk-redeem-meta">{shown.reward} · till {expiry}</div>
                  <div className="tk-redeem-sent">
                    <Tick />
                    Also sent to your WhatsApp
                  </div>
                </div>
              </div>
              <div className="tk-section">
                <ActionsRow actions={business.actions} preview onServices={() => setAfter(false)} />
              </div>
              <div className="h-6" />
              <div className="tk-cta">
                <span className="tk-btn tk-btn-gold">Share my Tikka</span>
              </div>
            </>
          ) : (
            <>
              <div className="tk-section">
                <ActionsRow actions={business.actions} preview onServices={() => setTab("services")} />
              </div>
              <div className="tk-section">
                <DropContents items={items} note={note} />
              </div>
              <div className="tk-section">
                <ProfileTabs business={business} tab={tab} onTab={setTab} reviews={reviews} />
              </div>
              <div className="h-6" />
              <div className="tk-cta">
                {drop?.opensLabel ? (
                  <>
                    <span className="tk-btn tk-btn-paper">Notify me</span>
                    <p className="tk-cta-note">{drop.opensLabel}</p>
                  </>
                ) : (
                  <>
                <span className="tk-btn tk-btn-gold">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" />
                  </svg>
                  Claim via WhatsApp
                </span>
                <p className="tk-cta-note">
                  {count(LEFT)} of {count(TOTAL)} left · One per WhatsApp number
                </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Phones: opens the full claim-page preview in a full-screen sheet. */
export function FullPreviewButton(props: Parameters<typeof ClaimPreview>[0] & { className?: string }) {
  const { className = "", ...preview } = props;
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`btn btn-secondary ${className}`} onClick={() => ref.current?.showModal()}>
        <Smartphone />
        See your full claim page
      </button>
      <dialog
        ref={ref}
        aria-label="Claim page preview"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink backdrop:bg-transparent"
      >
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface-raised px-4">
          <span className="text-label">What claimers will see</span>
          <button type="button" onClick={() => ref.current?.close()} className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close preview">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="px-3 py-4">
          <ClaimPreview {...preview} />
        </div>
      </dialog>
    </>
  );
}
