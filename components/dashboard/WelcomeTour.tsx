"use client";

import { ArrowLeft, Eye, MessageCircle, ScanLine } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { finishTour } from "@/app/(auth)/actions";
import { Spark, Tick } from "@/components/tikka/glyphs";
import { SoloCard } from "@/components/tikka/SoloCard";
import { TikkaCard, type CardFace } from "@/components/tikka/TikkaCard";
import { TikkaPack } from "@/components/tikka/TikkaPack";

const FACE: CardFace = {
  name: "Glow Studio",
  initials: "GS",
  category: "Skin & beauty studio",
  area: "Lekki",
  city: "Lagos",
  brandColor: "#9C3B5C",
  onBrandColor: "#FFFFFF",
  verified: true,
  rating: 4.8,
  reviewCount: 126,
  tagline: "Facials, peels and glow-ups since 2019.",
};

/* 1 · This is a Tikka: tap to tear it open */
function TearDemo() {
  const [beat, setBeat] = useState<"sealed" | "opening" | "front">("sealed");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  function tear() {
    if (beat !== "sealed") return;
    try {
      navigator.vibrate?.(15);
    } catch {}
    setBeat("opening");
    t.current = setTimeout(() => setBeat("front"), 1250);
  }
  return (
    <div className="tour-stage-fit">
      <div data-theme="light" className="tk-stage">
        {beat !== "front" && (
          <TikkaPack
            businessName={FACE.name}
            initials={FACE.initials}
            brandColor={FACE.brandColor}
            onBrandColor={FACE.onBrandColor}
            total={600}
            contents={{ legendary: 10, rare: 50, thankYou: 540 }}
            opening={beat === "opening"}
            onTear={tear}
          />
        )}
        {beat !== "sealed" && (
          <TikkaCard face={FACE} total={600} finish="holo" className={beat === "opening" ? "tk-rising" : ""} />
        )}
      </div>
      <p className="text-caption mt-1 h-4 text-center text-on-night-muted" aria-live="polite">
        {beat === "sealed" ? "Tap the wrapper to tear it open" : beat === "front" ? "Your business, on the front" : ""}
      </p>
    </div>
  );
}

/* 2 · Every Tikka holds something */
function TiersDemo() {
  const cards = [
    { tier: "thank_you" as const, reward: "Priority booking", code: "GS-RT6CE", serial: "0533", claimer: "Tunde" },
    { tier: "rare" as const, reward: "20% off any service", code: "GS-7X4QP", serial: "0412", claimer: "Adaeze" },
    { tier: "legendary" as const, reward: "Free signature facial", code: "GS-K9MWA", serial: "0087", claimer: "Kemi" },
  ];
  return (
    <div className="flex h-[400px] items-center justify-center">
      <div className="relative h-[280px] w-[320px]">
        {cards.map((c, i) => (
          <div
            key={c.tier}
            className="absolute top-0"
            style={{ left: i * 76, transform: `rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -6 : 10}px)`, zIndex: i }}
          >
            <SoloCard
              zoom={0.6}
              flipped
              face={FACE}
              total={600}
              reveal={{ ...c, expiry: "31 Oct" }}
              label={`${c.tier === "thank_you" ? "Thank-you" : c.tier} Tikka: ${c.reward}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* 3 · How it works */
function FlowDemo() {
  const steps = [
    { Icon: MessageCircle, title: "They claim on WhatsApp", body: "One tap. Their Tikka lands in their WhatsApp with a code." },
    { Icon: ScanLine, title: "They show it at the counter", body: "You or your staff check the code and confirm. Free." },
    { Icon: Eye, title: "You see every lead", body: "Everyone who claimed, live, even if they haven't come in yet." },
  ];
  return (
    <ol className="mx-auto flex h-[400px] max-w-[340px] flex-col justify-center gap-3">
      {steps.map(({ Icon, title, body }, i) => (
        <li key={title} className="flex gap-4 rounded-md bg-night-raised p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-on-night text-night">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="text-serial font-mono uppercase text-on-night-muted">Step {i + 1}</div>
            <div className="text-title mt-0.5 text-[17px] leading-6">{title}</div>
            <p className="text-body mt-1 text-on-night-muted">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* 4 · What it costs */
function CostDemo({ from }: { from: string }) {
  return (
    <div className="mx-auto flex h-[400px] max-w-[340px] flex-col justify-center gap-3">
      <div className="rounded-md bg-night-raised p-5">
        <div className="text-serial font-mono uppercase text-on-night-muted">Free</div>
        <ul className="text-body mt-3 grid gap-2.5">
          {["Your business page, always", "Your first drop", "Redeeming codes, with staff logins"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Tick className="mt-0.5 size-5 shrink-0 text-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-md bg-on-night p-5 text-night">
        <div className="text-serial font-mono uppercase opacity-70">After that</div>
        <p className="text-body-lg mt-2 font-semibold">Pay per drop, from {from}.</p>
        <p className="text-body mt-1 opacity-75">Every person who claims is yours to follow up.</p>
      </div>
    </div>
  );
}

const SCREENS: { title: string; body: string; Visual: React.ComponentType<{ from: string }> }[] = [
  { title: "This is a Tikka", body: "A collectible card from your business, sealed until someone tears it open.", Visual: TearDemo },
  { title: "Every Tikka holds something", body: "Legendary, rare and thank-you. You choose what's inside each one.", Visual: TiersDemo },
  { title: "How it works", body: "No app and no forms for your customers.", Visual: FlowDemo },
  {
    title: "What it costs",
    body: "Your business page is free. Your first drop is free. After that, pay per drop. Every person who claims is yours to follow up.",
    Visual: CostDemo,
  },
];

/** `from` is the cheapest paid drop ("₦5,000"), read from drop_tiers on the server. */
export function WelcomeTour({ name, from }: { name: string; from: string }) {
  const [i, setI] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { title, body, Visual } = SCREENS[i];
  const last = i === SCREENS.length - 1;

  // Move focus to the new heading when the screen changes (not on first load).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [i]);

  return (
    <div className="stage flex min-h-dvh flex-col bg-night text-on-night">
      <header className="mx-auto flex h-16 w-full max-w-[480px] items-center justify-between px-4">
        <Image src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={82} height={24} priority />
        {!last && (
          <form action={finishTour}>
            <button type="submit" className="text-label h-11 rounded-md px-3 text-on-night-muted hover:text-on-night">
              Skip
            </button>
          </form>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4">
        {i === 0 && <p className="text-label mt-2 text-center text-gold">Welcome, {name}</p>}
        <div className="mt-2" key={i}>
          <Visual from={from} />
        </div>
        <div className="mt-4 text-center">
          <p className="text-serial font-mono uppercase text-on-night-muted">
            {i + 1} of {SCREENS.length}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="text-heading mt-2 outline-none">
            {title}
          </h1>
          <p className="text-body-lg mx-auto mt-2 max-w-[360px] text-on-night-muted">{body}</p>
        </div>

        <div className="mt-auto pb-8 pt-8">
          <div className="mb-5 flex justify-center gap-1.5" aria-hidden="true">
            {SCREENS.map((s, n) => (
              <span
                key={s.title}
                className={`h-1.5 rounded-pill transition-all duration-300 ${n === i ? "w-6 bg-on-night" : "w-1.5 bg-night-raised"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="btn btn-lg shrink-0 bg-night-raised px-4 text-on-night hover:bg-night-raised"
                aria-label="Back"
              >
                <ArrowLeft />
              </button>
            )}
            {last ? (
              <form action={finishTour} className="flex-1">
                <input type="hidden" name="next" value="setup" />
                <button type="submit" className="btn btn-paper btn-lg w-full">
                  <Spark className="text-gold" />
                  Set up your card
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setI(i + 1)} className="btn btn-paper btn-lg flex-1">
                Next
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
