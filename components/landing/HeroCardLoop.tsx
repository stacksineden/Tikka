"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spark } from "@/components/tikka/glyphs";
import { TikkaCard, type CardFace, type CardReveal } from "@/components/tikka/TikkaCard";
import { TikkaPack } from "@/components/tikka/TikkaPack";
import { TIER_VAR } from "@/components/tikka/RarityBadge";
import { ExampleTag } from "./ExampleTag";

type Beat = "sealed" | "opening" | "front" | "charging" | "flipping" | "revealed" | "out";

// Timings from the card reference: unwrap 1.25s, hold 1.3s, flip 0.7s. The rests between
// beats are slower than the real flow so a landing-page visitor can follow along.
const NEXT: Record<Beat, [Beat, number]> = {
  sealed: ["opening", 1800],
  opening: ["front", 1250],
  front: ["charging", 1700],
  charging: ["flipping", 1300],
  flipping: ["revealed", 700],
  revealed: ["out", 3400],
  out: ["sealed", 450],
};

const STEPS: { label: string; beats: Beat[] }[] = [
  { label: "Tear open", beats: ["sealed", "opening"] },
  { label: "Claim on WhatsApp", beats: ["front"] },
  { label: "Hold", beats: ["charging", "flipping"] },
  { label: "Flip", beats: ["revealed", "out"] },
];

const FACE: CardFace = {
  name: "Glow Studio",
  initials: "GS",
  category: "Skin & beauty studio",
  area: "Lekki",
  city: "Lagos",
  brandColor: "#9C3B5C",
  onBrandColor: "#FFFFFF",
  verified: true,
  tagline: "Facials, peels and glow-ups since 2019.",
};

const OUTCOMES: CardReveal[] = [
  { tier: "rare", reward: "20% off any service", code: "GS-7X4QP", expiry: "31 Oct", serial: "0412", claimer: "Adaeze" },
  { tier: "legendary", reward: "Free signature facial", code: "GS-K9MWA", expiry: "31 Oct", serial: "0087", claimer: "Kemi" },
  { tier: "thank_you", reward: "Priority booking", code: "GS-RT6CE", expiry: "31 Oct", serial: "0533", claimer: "Tunde" },
];

const RAYS = Array.from({ length: 8 }, (_, i) => ({ angle: i * 45 + 22, delay: 0.5 + (i % 2) * 0.08, alt: i % 2 === 1 }));
const CONFETTI_COLORS = ["var(--gold)", "var(--rarity-legendary)", "var(--on-night)", "var(--rarity-common)"];
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: ((i * 37 + 11) % 100) + "%",
  color: CONFETTI_COLORS[i % 4],
  dur: (1.5 + (i % 5) * 0.18).toFixed(2) + "s",
  delay: (0.55 + (i % 7) * 0.07).toFixed(2) + "s",
}));

export function HeroCardLoop() {
  const [beat, setBeat] = useState<Beat>("sealed");
  const [round, setRound] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Stop looping when off screen or the tab is hidden: no work for nobody watching.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const running = !paused && visible && !reduced;

  useEffect(() => {
    if (!running) return;
    const [next, ms] = NEXT[beat];
    const t = setTimeout(() => {
      if (next === "sealed") setRound((r) => r + 1);
      setBeat(next);
    }, ms);
    return () => clearTimeout(t);
  }, [beat, running]);

  // Reduced motion: no loop. Show the revealed card, still.
  const shown: Beat = reduced ? "revealed" : beat;
  const outcome = OUTCOMES[round % OUTCOMES.length];
  const flipped = shown === "flipping" || shown === "revealed" || shown === "out";
  const claimed = shown === "charging" || flipped;
  const stageCls = [
    shown === "charging" ? "is-charging" : "",
    flipped ? "is-flipped" : "",
    shown === "revealed" ? "is-revealed" : "",
  ].join(" ");

  const activeStep = STEPS.findIndex((s) => s.beats.includes(shown));

  return (
    <div ref={rootRef} className="flex flex-col items-center">
      <ExampleTag onNight />
      <div
        className="hero-stage-fit"
        role="img"
        aria-label={`A Tikka from Glow Studio tearing open, then flipping to show ${outcome.reward}.`}
      >
        <div
          data-theme="light"
          className={`tk-stage transition-opacity duration-400 ${stageCls} ${shown === "out" ? "opacity-0" : "opacity-100"}`}
          aria-hidden="true"
        >
          {(shown === "sealed" || shown === "opening") && (
            <TikkaPack
              as="div"
              businessName={FACE.name}
              initials={FACE.initials}
              brandColor={FACE.brandColor}
              onBrandColor={FACE.onBrandColor}
              total={600}
              contents={{ legendary: 10, rare: 50, thankYou: 540 }}
              opening={shown === "opening"}
            />
          )}
          {shown !== "sealed" && (
            <TikkaCard
              key={round}
              face={FACE}
              total={600}
              finish="holo"
              claimedBy={claimed ? outcome.claimer : undefined}
              reveal={outcome}
              className={shown === "opening" ? "tk-rising" : ""}
            />
          )}
          {shown === "revealed" && !reduced && (
            <div className="tk-burst">
              {RAYS.map((r, i) => (
                <div key={i} className="tk-ray" style={{ transform: `rotate(${r.angle}deg)` }}>
                  <div className="tk-ray-in" style={{ animationDelay: `${r.delay}s` }}>
                    <Spark style={{ color: r.alt ? "var(--on-night)" : TIER_VAR[outcome.tier] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {shown === "revealed" && outcome.tier === "legendary" && !reduced && (
            <div className="tk-confetti">
              {CONFETTI.map((c, i) => (
                <i
                  key={i}
                  className="tk-conf"
                  style={{ left: c.left, background: c.color, animationDuration: c.dur, animationDelay: c.delay }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <ol className="flex flex-wrap justify-center gap-x-3.5 gap-y-1">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              className={`text-caption flex items-center gap-1.5 transition-colors ${
                i === activeStep ? "text-on-night" : "text-on-night-muted/70"
              }`}
            >
              <span
                className={`font-mono text-[10px] grid size-4 place-items-center rounded-pill ${
                  i === activeStep ? "bg-gold text-on-gold" : "bg-night-raised text-on-night-muted"
                }`}
              >
                {i + 1}
              </span>
              {s.label}
            </li>
          ))}
        </ol>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="grid size-11 shrink-0 place-items-center rounded-pill text-on-night-muted hover:text-on-night"
            aria-label={paused ? "Play the card animation" : "Pause the card animation"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
