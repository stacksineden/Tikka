"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { ActionsRow, DropContents, ProfileTabs, type ProfileTab, type ReviewItem } from "@/components/tikka/ClaimProfile";
import { Spark, Star, Tick } from "@/components/tikka/glyphs";
import { TIER_LABEL, TIER_VAR } from "@/components/tikka/RarityBadge";
import { TikkaCard, type CardFace } from "@/components/tikka/TikkaCard";
import { TikkaPack } from "@/components/tikka/TikkaPack";
import { NotifyMe, ReportDrop } from "@/components/market/NotifyMe";
import { firstName } from "@/lib/claim";
import { clockTime, count, shortDate } from "@/lib/format";
import { VISIT_PARTS, type VisitPart } from "@/lib/visit";
import type { Business, CardStatus, ClaimedCard, EventKind, PublicDrop, Source } from "@/lib/types";

// The claim page (PRD A1), ported from design/card-reference/Main.dc.html:
// sealed → opening (1.25s) → front → claim → verifying → ready → [hold 1.3s] → flipping (0.7s) → revealed.
// "closed" is the sold-out or ended wrapper. CSS does the motion; this file only moves between beats.

type Beat = "sealed" | "opening" | "front" | "claim" | "verifying" | "ready" | "flipping" | "revealed" | "closed";

export type ClaimProfileData = Pick<
  Business,
  "name" | "about" | "hours" | "area" | "city" | "services" | "actions" | "rating" | "reviewCount" | "hasVideo" | "videoPosterUrl" | "videoUrl"
>;

const RAYS = Array.from({ length: 8 }, (_, i) => ({ angle: i * 45 + 22, delay: 0.5 + (i % 2) * 0.08, alt: i % 2 === 1 }));
const CONFETTI_COLORS = ["var(--gold)", "var(--rarity-legendary)", "var(--on-night)", "var(--rarity-common)"];
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: ((i * 37 + 11) % 100) + "%",
  color: CONFETTI_COLORS[i % 4],
  dur: (1.5 + (i % 5) * 0.18).toFixed(2) + "s",
  delay: (0.55 + (i % 7) * 0.07).toFixed(2) + "s",
}));

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Drops in the database have uuids; demo drops don't (they claim instantly, without WhatsApp). */
const REAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IntentPoll = { kind: "ready"; card: ClaimedCard; qr: string; status: CardStatus } | { kind: "pending" | "sold_out" | "market_sold_out" | "blocked_new_only" | "blocked_period" | "expired" | "invalid" };

export function ClaimFlow({
  businessSlug,
  face,
  profile,
  reviews,
  drop: initialDrop,
  source,
  posterId,
  claimed,
  view = "drop",
  firstVisit = false,
  claimMode = "whatsapp",
  turnstileSiteKey,
}: {
  businessSlug: string;
  face: CardFace;
  profile: ClaimProfileData;
  reviews: ReviewItem[];
  drop: PublicDrop;
  source: Source;
  /** QR visits: the poster they scanned, so claims count toward it. */
  posterId?: string;
  /** A card already claimed: this browser's (claim page) or the WhatsApp link's (card page). */
  claimed?: { card: ClaimedCard; qr: string; status: CardStatus };
  /** "card" is /t/[token]: the claimer's own card, not the drop. */
  view?: "drop" | "card";
  /** First open of the card link: hold and flip before the card shows. */
  firstVisit?: boolean;
  /** "page" while WhatsApp waits for Meta: they type their number here (lib/claim-mode.ts). */
  claimMode?: "whatsapp" | "page";
  /** Cloudflare Turnstile's public key for the page claim's bot check, when it's set up. */
  turnstileSiteKey?: string;
}) {
  const [beat, setBeat] = useState<Beat>(
    claimed ? (firstVisit ? "ready" : "revealed") : initialDrop.status === "sold_out" || initialDrop.status === "ended" ? "closed" : "sealed",
  );
  const [flippedHere, setFlippedHere] = useState(false);
  const [status, setStatus] = useState(initialDrop.status);
  const [left, setLeft] = useState(initialDrop.left);
  const [charging, setCharging] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [card, setCard] = useState<ClaimedCard | null>(claimed?.card ?? null);
  const [qr, setQr] = useState(claimed?.qr ?? "");
  const [note, setNote] = useState<string>();
  const [futureDrops, setFutureDrops] = useState(false);
  const onPage = claimMode === "page";
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string>();
  const turnstile = useTurnstile(onPage && beat === "claim" ? turnstileSiteKey : undefined);
  const [cardState, setCardState] = useState<CardStatus | undefined>(claimed?.status);
  const [announce, setAnnounce] = useState("");
  // Click-to-claim: the TK-XXXXX code and the WhatsApp link it goes out in.
  const [intent, setIntent] = useState<{ token: string; waUrl: string } | null>(null);

  const beatRef = useRef(beat);
  const chargingRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);

  const drop = { ...initialDrop, status, left };
  const already = Boolean(claimed) && view === "drop";
  const dropPath = `/d/${businessSlug}/${drop.slug}`;

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  // The live counter. Realtime arrives with M5; until then a light poll while the page is visible.
  useEffect(() => {
    if (status !== "live" && status !== "scheduled") return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/counter?b=${encodeURIComponent(businessSlug)}&d=${encodeURIComponent(drop.slug)}`, { cache: "no-store" });
        if (!r.ok) return;
        const next = (await r.json()) as { left: number; status: PublicDrop["status"] };
        setLeft(next.left);
        setStatus(next.status);
      } catch {}
    }, 15_000);
    return () => clearInterval(id);
  }, [status, businessSlug, drop.slug]);

  // Page-claim mode: Tikka can't send the thank-you on WhatsApp, so the card itself notices when
  // staff confirm the code at the counter. It turns "used" and the review stars appear right there.
  // A light check every few seconds while the card is open, for half an hour at most.
  const watchCounter = beat === "revealed" && card?.confirmed === false && !cardState?.redeemedAt && !cardState?.expired;
  const cardToken = card?.token;
  useEffect(() => {
    if (!watchCounter || !cardToken) return;
    const until = Date.now() + 30 * 60_000;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden || Date.now() > until) return;
      busy = true;
      try {
        const r = await fetch(`/api/card-status?t=${encodeURIComponent(cardToken)}`, { cache: "no-store" });
        if (r.ok) {
          const next = ((await r.json()) as { status: CardStatus }).status;
          if (next.redeemedAt) {
            setCardState(next);
            buzz([20, 60, 20]);
            setAnnounce(next.review === "open" ? `Used. How was ${face.name}? Tap the stars to rate your visit.` : "Used.");
          }
        }
      } catch {
      } finally {
        busy = false;
      }
    };
    const id = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [watchCounter, cardToken, face.name]);

  function settle(r: IntentPoll) {
    setIntent(null);
    if (r.kind === "ready") return ready(r.card, r.qr, r.status);
    if (r.kind === "sold_out") {
      setStatus("sold_out");
      setLeft(0);
      return go("closed");
    }
    go("front");
    setNote(
      r.kind === "market_sold_out"
        ? `The marketplace's share of this drop is gone. ${face.name}'s own link may still have some.`
        : r.kind === "blocked_new_only"
          ? `This drop is for new customers, and your number has claimed from ${face.name} before.`
          : r.kind === "blocked_period"
            ? `You had a Tikka from ${face.name} recently. Catch their next drop.`
            : r.kind === "expired"
              ? "That took a while, so the code expired. Tap Claim to get a new one."
              : "That didn't go through. Tap Claim again.",
    );
  }

  function ready(c: ClaimedCard, code: string, s: CardStatus | null | undefined) {
    setCard(c);
    setQr(code);
    setCardState(s ?? undefined);
    setLeft((n) => Math.max(0, n - 1));
    go("ready");
    buzz(20);
    setAnnounce("Confirmed. Press and hold the button to open your Tikka.");
  }

  function go(next: Beat) {
    beatRef.current = next;
    setBeat(next);
  }
  function later(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  function beacon(kind: EventKind) {
    const body = JSON.stringify({ dropId: drop.id, kind, source });
    try {
      if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
    } catch {}
    fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  }

  // Waiting for WhatsApp: ask every 2 seconds while the page is in front, and straight away when
  // they come back from WhatsApp. The code lasts 30 minutes.
  useEffect(() => {
    if (beat !== "verifying" || !intent) return;
    let done = false;
    const check = async () => {
      if (done || document.hidden) return;
      const r = (await fetch(`/api/claim-intent?token=${encodeURIComponent(intent.token)}`, { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => ({ kind: "pending" }))) as IntentPoll;
      if (done || r.kind === "pending") return;
      done = true;
      settle(r);
    };
    const id = setInterval(check, 2000);
    document.addEventListener("visibilitychange", check);
    return () => {
      done = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
    // settle only reads setters and props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, intent]);

  function tear() {
    if (beatRef.current !== "sealed") return;
    buzz(15);
    beacon("unwrap");
    go("opening");
    later(() => go("front"), 1250);
  }

  function openClaim() {
    if (status !== "live") return;
    beacon("claim_tap");
    setNameError(undefined);
    go("claim");
  }

  async function submitClaim(e: FormEvent) {
    e.preventDefault();
    const first = firstName(name);
    if (!first) {
      setNameError(`Add your first name so ${face.name} knows who's coming.`);
      return;
    }
    if (onPage && REAL.test(drop.id)) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) {
        setPhoneError("Add your WhatsApp number, like 0803 123 4567.");
        return;
      }
      if (turnstileSiteKey && !turnstile.token) {
        setPhoneError("One moment, we're checking you're not a robot. Then tap Claim again.");
        return;
      }
      beacon("claim_continue");
      go("verifying");
      const r = (await fetch("/api/claim-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessSlug, drop: drop.slug, name: first, phone, source, posterId, turnstile: turnstile.token }),
      })
        .then((x) => x.json())
        .catch(() => ({ ok: false, reason: "network" }))) as { ok: true; card: ClaimedCard; qr: string; status: CardStatus | null } | { ok: false; reason: string };
      turnstile.reset();
      if (r.ok) return ready(r.card, r.qr, r.status);
      if (r.reason === "sold_out" || r.reason === "ended") {
        setStatus(r.reason);
        if (r.reason === "sold_out") setLeft(0);
        return go("closed");
      }
      if (r.reason === "scheduled") setStatus("scheduled");
      if (r.reason === "phone" || r.reason === "invalid_phone" || r.reason === "number_taken" || r.reason === "check") {
        go("claim");
        return setPhoneError(
          r.reason === "number_taken"
            ? "That number already has a Tikka from this drop. Check the number, or use your own."
            : r.reason === "check"
              ? "We couldn't check you're not a robot. Wait a moment and tap Claim again."
              : "That doesn't look like a Nigerian mobile number. Check it and try again.",
        );
      }
      go("front");
      return setNote(PAGE_CLAIM_NOTES[r.reason] ?? "That didn't go through. Tap Claim again.");
    }
    beacon("claim_continue");
    go("verifying");
    if (REAL.test(drop.id)) {
      // The server makes the claim code; WhatsApp proves the number and sends the card.
      const r = (await fetch("/api/claim-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessSlug, drop: drop.slug, name: first, source, posterId, futureDrops }),
      })
        .then((x) => x.json())
        .catch(() => ({ ok: false, reason: "network" }))) as { ok: true; token: string; waUrl: string } | { ok: false; reason: string };
      if (r.ok) return setIntent({ token: r.token, waUrl: r.waUrl });
      if (r.reason === "sold_out" || r.reason === "ended") {
        setStatus(r.reason);
        if (r.reason === "sold_out") setLeft(0);
        return go("closed");
      }
      if (r.reason === "scheduled") setStatus("scheduled");
      go("front");
      return setNote(
        r.reason === "network"
          ? "No connection. Check your data and tap Claim again."
          : r.reason === "slow_down"
            ? "Too many tries. Wait a minute, then tap Claim again."
            : r.reason === "prelaunch"
              ? "Tikkas open to claim very soon. Check back in a few days."
              : "That didn't go through. Tap Claim again.",
      );
    }
    // DEMO: demo drops claim straight away, without WhatsApp.
    const [res] = await Promise.all([
      fetch("/api/demo/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessSlug, drop: drop.slug, name: first, source, posterId, futureDrops }),
      })
        .then((r) => r.json() as Promise<{ ok: true; card: ClaimedCard; qr: string; status: CardStatus | null } | { ok: false; reason: string }>)
        .catch(() => ({ ok: false as const, reason: "network" })),
      wait(1500),
    ]);
    if (res.ok) return ready(res.card, res.qr, res.status);
    if (res.reason === "sold_out" || res.reason === "ended") {
      setStatus(res.reason);
      if (res.reason === "sold_out") setLeft(0);
      go("closed");
      return;
    }
    if (res.reason === "scheduled") setStatus("scheduled");
    go("front");
    setNote(res.reason === "network" ? "No connection. Check your data and tap Claim again." : "That didn't go through. Tap Claim again.");
  }

  function startHold(e?: PointerEvent) {
    if (beatRef.current !== "ready" || chargingRef.current) return;
    if (e?.pointerType) e.preventDefault();
    chargingRef.current = true;
    setCharging(true);
    buzz(10);
    holdTimer.current = setTimeout(reveal, 1300);
    timers.current.push(holdTimer.current);
  }
  function endHold() {
    if (beatRef.current !== "ready" || !chargingRef.current) return;
    clearTimeout(holdTimer.current);
    chargingRef.current = false;
    setCharging(false);
  }
  function reveal() {
    chargingRef.current = false;
    setCharging(false);
    go("flipping");
    setFlippedHere(true);
    buzz([30, 50, 80]);
    later(() => {
      go("revealed");
      if (card) setAnnounce(revealedLabel(card));
    }, 700);
  }

  function tilt(e: PointerEvent<HTMLDivElement>) {
    const el = stageRef.current?.querySelector<HTMLElement>(".tk-tilt");
    if (!el || e.pointerType === "touch" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${(-y * 14).toFixed(2)}deg) rotateY(${(x * 16).toFixed(2)}deg)`;
  }
  function tiltReset() {
    const el = stageRef.current?.querySelector<HTMLElement>(".tk-tilt");
    if (el) el.style.transform = "";
    endHold();
  }

  async function share(text: string) {
    const url = `${location.origin}${dropPath}`;
    try {
      // The card as a picture where the phone can share files (it never shows the code); else the link.
      if (card && navigator.share && navigator.canShare) {
        const res = await fetch(`/api/card-image?t=${encodeURIComponent(card.token)}`).catch(() => null);
        const blob = res?.ok ? await res.blob() : null;
        const file = blob && new File([blob], "my-tikka.png", { type: "image/png" });
        if (file && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: `A Tikka from ${face.name}`, text: `${text} ${url}` });
      }
      if (navigator.share) return await navigator.share({ title: `A Tikka from ${face.name}`, text, url });
      await navigator.clipboard.writeText(url);
      setNote("Link copied. Send it to a friend.");
    } catch {}
  }


  const revealedLabel = (c: ClaimedCard) =>
    `${c.tier === "thank_you" ? "Thank you for coming through." : "You got a Tikka!"} ${TIER_LABEL[c.tier]}: ${c.reward}.${c.instruction ? ` ${c.instruction}.` : ""} Code ${c.code}, valid till ${shortDate(c.expiresAt)}. Issued to ${c.claimer}, number ${c.serial} of ${count(c.total)}.`;

  const flipped = beat === "flipping" || beat === "revealed";
  const holdBeat = beat === "ready";
  const showPack = beat === "sealed" || beat === "opening" || beat === "closed";
  const showCard = !showPack || beat === "opening";
  const profileBeat = beat === "front" || beat === "claim" || beat === "verifying";
  const opensLabel = `Opens ${shortDate(drop.startsAt)}, ${clockTime(drop.startsAt)}`;
  const low = drop.left / drop.total < 0.1;
  const legendary = card?.tier === "legendary";
  const rootCls = [charging ? "is-charging" : "", flipped ? "is-flipped" : "", beat === "revealed" ? "is-revealed" : "", holdBeat ? "is-ready" : ""].join(" ");

  const cardLabel = flipped && card
    ? revealedLabel(card)
    : card
      ? `Your Tikka from ${face.name}, claimed by ${card.claimer}. Hold to open.`
      : `A Tikka from ${face.name}, sealed until you claim.`;

  return (
    <div className="tk-page">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="tk-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={75} height={22} />
        {flipped && card ? (
          <span className="counter">
            <span>
              No. <b>{card.serial}</b> / {count(card.total)}
            </span>
          </span>
        ) : status === "scheduled" ? (
          <span className="counter">
            <span>{opensLabel}</span>
          </span>
        ) : status === "sold_out" ? (
          <span className="counter">
            <span>All {count(drop.total)} claimed</span>
          </span>
        ) : status === "ended" ? (
          <span className="counter">
            <span>Ended</span>
          </span>
        ) : (
          <span className={`counter ${low ? "counter--low" : ""}`} aria-live="polite">
            <span className="counter__dot" aria-hidden="true" />
            <span>
              <b>{count(drop.left)}</b> of {count(drop.total)} left
            </span>
          </span>
        )}
      </div>

      <div className={`tk-body ${rootCls}`}>
        <div
          ref={stageRef}
          className="tk-stage"
          onPointerDown={(e) => holdBeat && startHold(e)}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={tiltReset}
          onPointerMove={tilt}
          onContextMenu={(e) => holdBeat && e.preventDefault()}
        >
          {showCard && (
            <div role="img" aria-label={cardLabel}>
              <div aria-hidden="true">
                <TikkaCard
                  face={face}
                  total={drop.total}
                  finish={drop.finish}
                  claimedBy={card && beat !== "opening" && !profileBeat ? card.claimer : undefined}
                  reveal={card ? { tier: card.tier, reward: card.reward, instruction: card.instruction, code: card.code, expiry: shortDate(card.expiresAt).replace(/^\w+ /, ""), serial: card.serial, claimer: card.claimer } : undefined}
                  className={beat === "opening" ? "tk-rising" : ""}
                />
              </div>
            </div>
          )}
          {flipped && cardState?.redeemedAt && (
            <div className="tk-stamp" aria-hidden="true">
              Used on {shortDate(cardState.redeemedAt)}
            </div>
          )}
          {showPack && (
            <TikkaPack
              businessName={face.name}
              initials={face.initials}
              brandColor={face.brandColor}
              onBrandColor={face.onBrandColor}
              total={drop.total}
              contents={drop.contents}
              opening={beat === "opening"}
              empty={beat === "closed"}
              as={beat === "closed" ? "div" : "button"}
              onTear={tear}
            />
          )}
          {beat === "revealed" && flippedHere && (
            <div className="tk-burst" aria-hidden="true">
              {RAYS.map((r) => (
                <div key={r.angle} className="tk-ray" style={{ transform: `rotate(${r.angle}deg)` }}>
                  <div className="tk-ray-in" style={{ animationDelay: `${r.delay}s` }}>
                    <Spark style={{ color: r.alt ? "var(--on-night)" : card ? TIER_VAR[card.tier] : undefined }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {beat === "revealed" && legendary && flippedHere && (
            <div className="tk-confetti" aria-hidden="true">
              {CONFETTI.map((c, i) => (
                <i key={i} className="tk-conf" style={{ left: c.left, background: c.color, animationDuration: c.dur, animationDelay: c.delay } as CSSProperties} />
              ))}
            </div>
          )}
        </div>

        {(beat === "sealed" || beat === "opening") && (
          <div className="tk-copy">
            <h1 className="tk-h">A Tikka from {face.name}</h1>
            <p className="tk-p">
              {status === "scheduled"
                ? `This drop opens ${shortDate(drop.startsAt)}, ${clockTime(drop.startsAt)}. Tear it open to meet them now.`
                : "Tear it open to meet them. Every Tikka holds something, and you see yours after you claim."}
            </p>
          </div>
        )}

        {beat === "closed" && (
          <div className="tk-copy">
            <h1 className="tk-h">{status === "sold_out" ? `All ${count(drop.total)} claimed` : "This drop has ended."}</h1>
            <p className="tk-p">Get notified when {face.name} drops again.</p>
          </div>
        )}

        {(profileBeat || beat === "closed") && (
          <>
            <div className="tk-section">
              <ActionsRow actions={profile.actions} onServices={() => setTab("services")} />
            </div>
            {profileBeat && (
              <div className="tk-section">
                <DropContents items={drop.items} note={drop.note} />
              </div>
            )}
            <div className="tk-section">
              <ProfileTabs business={profile} tab={tab} onTab={setTab} reviews={reviews} />
            </div>
          </>
        )}

        {holdBeat && card && (
          <div className="tk-hold">
            <button
              type="button"
              className="tk-holdbtn"
              aria-label="Hold to open your Tikka"
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(e) => (e.key === " " || e.key === "Enter") && endHold()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <svg className="tk-ring" viewBox="0 0 76 76" aria-hidden="true">
                <circle className="tk-ring-track" cx="38" cy="38" r="36" />
                <circle className="tk-ring-fill" cx="38" cy="38" r="36" />
              </svg>
              <Spark className="tk-holdspark" />
            </button>
            <div className="tk-hold-label">Hold to open</div>
            <p className="tk-hold-sub">Press and hold the card or the button.</p>
          </div>
        )}

        {view === "drop" && (profileBeat || beat === "closed" || beat === "sealed") && <ReportDrop dropId={drop.id} />}

        {beat === "revealed" && card && (
          <>
            {already && (
              <div className="tk-section">
                <div className="tk-banner">
                  <Tick />
                  You already have a Tikka from this drop
                </div>
              </div>
            )}
            <div className="tk-section">
              {cardState?.redeemedAt ? (
                <div className="tk-redeem">
                  <div className="tk-redeem-h">Used</div>
                  <div className="tk-redeem-meta">
                    {card.reward} · used on {shortDate(cardState.redeemedAt)}
                  </div>
                  <p className="tk-redeem-instr">Thanks for visiting {face.name}. Keep an eye out for their next drop.</p>
                  {cardState.nextVisit && !cardState.nextVisit.redeemedAt && (
                    <a className="tk-next" href={`/t/${cardState.nextVisit.token}`}>
                      <span>
                        <span className="tk-next-k">Your next-visit Tikka</span>
                        {cardState.nextVisit.reward} · till {shortDate(cardState.nextVisit.expiresAt)}
                      </span>
                      <span aria-hidden="true">→</span>
                    </a>
                  )}
                </div>
              ) : cardState?.expired ? (
                <div className="tk-redeem">
                  <div className="tk-redeem-h">Expired {shortDate(card.expiresAt)}</div>
                  <div className="tk-redeem-meta">{card.reward}</div>
                  <p className="tk-redeem-instr">This Tikka can&apos;t be used any more. {face.name} may drop again soon.</p>
                </div>
              ) : (
                <div className="tk-redeem">
                  <div className="tk-redeem-h">{card.kind === "bounce_back" ? "Your next-visit Tikka · show this at the counter" : "Show this at the counter"}</div>
                  <div className="tk-redeem-row">
                    <div className="min-w-0 flex-1">
                      <div className="tk-redeem-code">{card.code}</div>
                      <div className="tk-redeem-meta">
                        {card.reward} · till {shortDate(card.expiresAt)}
                      </div>
                    </div>
                    {qr && <div className="tk-redeem-qr" role="img" aria-label={`QR code for ${card.code}`} dangerouslySetInnerHTML={{ __html: qr }} />}
                  </div>
                  {card.instruction && <p className="tk-redeem-instr">{card.instruction}.</p>}
                  {card.confirmed === false ? (
                    <SaveTikka token={card.token} businessName={face.name} />
                  ) : (
                    <div className="tk-redeem-sent">
                      <Tick />
                      Also sent to your WhatsApp
                    </div>
                  )}
                </div>
              )}
            </div>
            {cardState?.visitOptions?.length ? (
              <div className="tk-section">
                <VisitPlan token={card.token} status={cardState} businessName={face.name} onChange={setCardState} remind={card.confirmed !== false} />
              </div>
            ) : null}
            {cardState?.review === "open" && (
              <div className="tk-section">
                <div className="tk-box">
                  <h2 className="tk-box-h">How was {face.name}?</h2>
                  <div className="tk-stars" role="group" aria-label="Rate your visit">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <a key={n} href={`/t/${card.token}/review?rating=${n}`} className="tk-star" aria-label={`${n} star${n === 1 ? "" : "s"}`}>
                        <Star />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="tk-section">
              <ActionsRow actions={profile.actions.filter((a) => a.kind !== "services")} />
            </div>
          </>
        )}
      </div>

      {!(holdBeat || beat === "flipping" || beat === "opening") && (
        <div className="tk-cta">
          {beat === "revealed" ? (
            <button type="button" className="tk-btn tk-btn-gold" onClick={() => share(`I got a Tikka from ${face.name}. Every Tikka holds something: open yours.`)}>
              <ShareIcon />
              Share my Tikka
            </button>
          ) : beat === "sealed" && status === "live" ? (
            <button type="button" className="tk-btn tk-btn-paper" onClick={tear}>
              Tear to open
            </button>
          ) : status === "live" ? (
            <button type="button" className="tk-btn tk-btn-gold" onClick={openClaim}>
              {onPage ? <Spark /> : <ChatIcon />}
              {onPage ? "Claim your Tikka" : "Claim via WhatsApp"}
            </button>
          ) : (
            <>
              <NotifyMe
                businessSlug={businessSlug}
                businessName={face.name}
                dropSlug={status === "scheduled" ? drop.slug : undefined}
                opensLabel={status === "scheduled" ? opensLabel.replace(/^Opens /, "") : undefined}
                className="tk-btn tk-btn-paper"
              >
                Notify me
              </NotifyMe>
              {status === "scheduled" && (
                <button type="button" className="tk-btn tk-btn-text" onClick={() => share(`${face.name} has a Tikka drop coming. Every Tikka holds something.`)}>
                  Tell a friend
                </button>
              )}
            </>
          )}
          <p className="tk-cta-note" aria-live="polite">
            {note ??
              (beat === "revealed"
                ? `${count(drop.left)} of ${count(drop.total)} left for your friends`
                : status === "live"
                  ? `${count(drop.left)} of ${count(drop.total)} left · One per WhatsApp number`
                  : status === "scheduled"
                    ? opensLabel
                    : `${face.name}'s next drop is one tap away`)}
          </p>
        </div>
      )}

      {beat === "claim" && (
        <>
          <button type="button" className="tk-scrim" aria-label="Close" onClick={() => go("front")} />
          <form className="tk-sheet" onSubmit={submitClaim} role="dialog" aria-modal="true" aria-labelledby="tk-sheet-h" noValidate>
            <div className="tk-grab" />
            <h2 className="tk-sheet-h" id="tk-sheet-h">
              Claim your Tikka
            </h2>
            <p className="tk-sheet-sub">
              {onPage ? `Your Tikka opens right here, so you can show it at ${face.name}.` : `Your Tikka is saved to your WhatsApp, so you can show it at ${face.name}.`}
            </p>
            <div className="tk-field">
              <label className="tk-label" htmlFor="tk-name">
                First name
              </label>
              <input
                className="tk-input"
                id="tk-name"
                type="text"
                autoComplete="given-name"
                autoCapitalize="words"
                enterKeyHint="go"
                maxLength={30}
                placeholder="Adaeze"
                value={name}
                autoFocus
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "tk-name-err" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
              />
              {nameError && (
                <p className="tk-error" id="tk-name-err">
                  {nameError}
                </p>
              )}
            </div>
            {onPage ? (
              <div className="tk-field">
                <label className="tk-label" htmlFor="tk-phone">
                  WhatsApp number
                </label>
                <input
                  className="tk-input"
                  id="tk-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={18}
                  placeholder="0803 123 4567"
                  value={phone}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? "tk-phone-err" : undefined}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneError(undefined);
                  }}
                />
                {phoneError && (
                  <p className="tk-error" id="tk-phone-err">
                    {phoneError}
                  </p>
                )}
              </div>
            ) : (
              <label className="tk-check">
                <input type="checkbox" checked={futureDrops} onChange={(e) => setFutureDrops(e.target.checked)} />
                <span>Send me future drops from {face.name}</span>
              </label>
            )}
            {onPage && turnstileSiteKey && <div ref={turnstile.ref} className="min-h-[65px]" />}
            <p className="tk-consent">
              {`${face.name} will be able to message you on WhatsApp about this drop.`}{" "}
              By continuing you agree to Tikka&apos;s{" "}
              <a href="/terms" target="_blank" rel="noopener">
                terms
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener">
                privacy policy
              </a>
              .
            </p>
            <button className="tk-btn tk-btn-gold" type="submit">
              {onPage ? <Spark /> : <ChatIcon />}
              {onPage ? "Claim my Tikka" : "Continue on WhatsApp"}
            </button>
            <button className="tk-btn tk-btn-text" type="button" onClick={() => go("front")}>
              Not now
            </button>
          </form>
        </>
      )}

      {beat === "verifying" && (
        <div className="tk-verify" role="status">
          {intent ? (
            <>
              <h2 className="tk-h">Claim it on WhatsApp</h2>
              <p className="tk-p">Send this code to Tikka on WhatsApp. Your Tikka shows up here, and in the chat, as soon as it&apos;s sent.</p>
              <span className="tk-claimcode" aria-label={`Your claim code is ${intent.token.split("").join(" ")}`}>
                {intent.token}
              </span>
              <a className="tk-btn tk-btn-gold" href={intent.waUrl} target="_blank" rel="noopener noreferrer">
                Open WhatsApp
              </a>
              <div className="tk-waiting">
                <div className="tk-spin tk-spin-sm" aria-hidden="true" />
                Waiting for your message…
              </div>
              <button
                className="tk-btn tk-btn-text"
                type="button"
                onClick={() => {
                  setIntent(null);
                  go("front");
                }}
              >
                Not now
              </button>
            </>
          ) : (
            <>
              <div className="tk-spin" aria-hidden="true" />
              <h2 className="tk-h">{onPage ? "Getting your Tikka" : "Confirming on WhatsApp"}</h2>
              <p className="tk-p">{onPage ? "One moment." : "Send the message WhatsApp opens with, then come straight back here."}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "When will you come in?" Only days the Tikka still works; one reminder that morning. */
function VisitPlan({ token, status, businessName, onChange, remind = true }: { token: string; status: CardStatus; businessName: string; onChange: (s: CardStatus) => void; remind?: boolean }) {
  const options = status.visitOptions ?? [];
  const [editing, setEditing] = useState(!status.plannedVisitDate);
  const [date, setDate] = useState(status.plannedVisitDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const planned = options.find((o) => o.date === status.plannedVisitDate);

  async function save(part: VisitPart) {
    setSaving(true);
    setError(false);
    const r = await fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, date, part }) })
      .then((x) => (x.ok ? (x.json() as Promise<{ status: CardStatus }>) : null))
      .catch(() => null);
    setSaving(false);
    if (!r) return setError(true);
    onChange(r.status);
    setEditing(false);
  }

  if (!editing && planned) {
    return (
      <div className="tk-box">
        <h2 className="tk-box-h">See you {planned.label === "Today" || planned.label === "Tomorrow" ? planned.label.toLowerCase() : planned.label}</h2>
        <p className="tk-plan-p">
          {VISIT_PARTS.find((p) => p.id === status.plannedVisitPart)?.label ?? ""} at {businessName}.{remind ? " We'll remind you on WhatsApp." : ""}
        </p>
        <button type="button" className="tk-chip" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="tk-box">
      <h2 className="tk-box-h">When will you come in?</h2>
      <div className="tk-chips" role="group" aria-label="Day">
        {options.map((o) => (
          <button key={o.date} type="button" className="tk-chip" aria-pressed={date === o.date} onClick={() => setDate(o.date)}>
            {o.label}
          </button>
        ))}
      </div>
      {date && (
        <div className="tk-chips" role="group" aria-label="Time of day">
          {VISIT_PARTS.map((p) => (
            <button key={p.id} type="button" className="tk-chip" disabled={saving} aria-pressed={status.plannedVisitDate === date && status.plannedVisitPart === p.id} onClick={() => save(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="tk-error">That didn&apos;t save. Check your data and try again.</p>}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** Why a page claim didn't go through, in the claimer's words (lib/claim-mode.ts). */
const PAGE_CLAIM_NOTES: Record<string, string> = {
  network: "No connection. Check your data and tap Claim again.",
  slow_down: "Too many tries. Wait a little, then tap Claim again.",
  prelaunch: "Tikkas open to claim very soon. Check back in a few days.",
  blocked_new_only: "This drop is for new customers. Watch out for their next one.",
  blocked_period: "You had a Tikka from here recently. Catch their next drop.",
  market_sold_out: "The marketplace Tikkas for this drop are gone. Follow them for the next one.",
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; "error-callback": () => void; appearance?: string }) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

/** Cloudflare Turnstile on the page claim: loads its script only when the sheet opens. */
function useTurnstile(siteKey: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string>();
  useEffect(() => {
    const el = ref.current;
    if (!siteKey || !el) return;
    let cancelled = false;
    const mount = () => {
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (cancelled || !ts || widget.current) return;
      widget.current = ts.render(el, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: setToken,
        "expired-callback": () => setToken(undefined),
        "error-callback": () => setToken(undefined),
      });
    };
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) mount();
    else {
      let script = document.getElementById("cf-turnstile") as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "cf-turnstile";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      cancelled = true;
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (ts && widget.current) ts.remove(widget.current);
      widget.current = null;
      setToken(undefined);
    };
  }, [siteKey]);
  return {
    ref,
    token,
    reset: () => {
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (ts && widget.current) ts.reset(widget.current);
      setToken(undefined);
    },
  };
}

/** A page-claimed Tikka isn't in their WhatsApp: a way to keep its link (send it to themselves). */
function SaveTikka({ token, businessName }: { token: string; businessName: string }) {
  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://usetikka.com"}/t/${token}`;
  const text = `My Tikka from ${businessName}. Show it at the counter: ${link}`;
  return (
    <div className="tk-save">
      <a className="tk-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        Save my Tikka
      </a>
      <p>Send it to yourself on WhatsApp, or screenshot this card, so you can show it at {businessName}.</p>
    </div>
  );
}
