"use client";

// "Finish setting up" (docs/DB_MOVE.md step 8): for a business set up the old way, the three things
// the new screens use, one question per screen like the new setup: what you do, where you work (and
// the travel fee), and the booking rules customers see. Its page, services and photos stay as they are.

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Car,
  Check,
  CircleCheck,
  Clapperboard,
  Crown,
  Eye,
  Flower2,
  Hand,
  Loader2,
  Plus,
  Repeat,
  Scissors,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishSetupAction } from "@/app/app/finish/actions";
import { presetRules, reachLabel, TRADES, type TradeId } from "@/lib/presets";
import type { TravelReach, WorkPlace } from "@/lib/types";

const TRADE_ICONS: Record<TradeId, LucideIcon> = { hair: Scissors, makeup: Sparkles, nails: Hand, lashes: Eye, barber: UserRound, spa: Flower2, gele: Crown, photo: Camera, video: Video, content: Clapperboard };
type Step = "trade" | "work" | "rules";
const STEPS: Step[] = ["trade", "work", "rules"];

export function FinishSetup({
  business,
  initial,
}: {
  business: { name: string; area: string; city: string; state: string };
  initial: { trades: TradeId[]; workPlace: WorkPlace | null; travelFee: number; travelReach: TravelReach; rules: string[] };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("trade");
  const [trades, setTrades] = useState<TradeId[]>(initial.trades);
  const [workPlace, setWorkPlace] = useState<WorkPlace | null>(initial.workPlace);
  const [travelFee, setTravelFee] = useState(initial.travelFee);
  const [reach, setReach] = useState<TravelReach>(initial.travelReach);
  const [rules, setRules] = useState<string[]>(initial.rules);
  const [rulesTouched, setRulesTouched] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();
  const index = STEPS.indexOf(step);

  const ready = { trade: trades.length > 0, work: !!workPlace, rules: true }[step];

  function next() {
    setProblem(undefined);
    if (step === "trade") return setStep("work");
    if (step === "work") {
      // The usual rules follow where they work, until the owner changes them.
      if (!rulesTouched) setRules(presetRules(workPlace ?? "shop", false));
      return setStep("rules");
    }
    start(async () => {
      const r = await finishSetupAction({ trades, workPlace: workPlace ?? "shop", travelFee, travelReach: reach, rules });
      if (!r.ok) return setProblem(r.error);
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-2 py-2">
        <button
          type="button"
          onClick={() => (index > 0 ? setStep(STEPS[index - 1]) : router.push("/app"))}
          aria-label={index > 0 ? "Back" : "Close"}
          className="grid size-11 place-items-center rounded-pill"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken" role="progressbar" aria-label="Progress" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={3}>
          <div className="h-full rounded-pill bg-brand transition-[width]" style={{ width: `${((index + 1) / 3) * 100}%` }} />
        </div>
        <span className="text-caption w-11 text-center text-ink-muted">{index + 1} of 3</span>
      </div>

      <main className="grid flex-1 content-start gap-5 px-4 pt-5 pb-6">
        {step === "trade" && (
          <>
            <Title title="What do you do?" lead={`Pick all that apply. It sets up Today, your calendar and your money for ${business.name}.`} />
            <div className="grid grid-cols-2 gap-2.5">
              {TRADES.map((t) => {
                const Icon = TRADE_ICONS[t.id];
                const on = trades.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTrades((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                    className={`relative grid min-h-24 content-start gap-2 rounded-card border-2 p-3 text-left ${on ? "border-brand bg-brand-soft" : "border-line bg-surface-raised"}`}
                  >
                    {on && (
                      <span className="absolute top-2.5 right-2.5 grid size-5.5 place-items-center rounded-pill bg-brand text-on-brand">
                        <Check size={14} aria-hidden="true" />
                      </span>
                    )}
                    <span className={`grid size-10 place-items-center rounded-pill ${on ? "bg-brand text-on-brand" : "bg-brand-soft text-brand"}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-[15px] leading-tight font-semibold">{t.name}</span>
                      <span className="text-caption leading-snug text-ink-muted">{t.examples}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "work" && (
          <>
            <Title title="Where do you work?" />
            <div className="grid gap-2.5">
              <Choice on={workPlace === "shop"} onClick={() => setWorkPlace("shop")} icon={Store} title="Customers come to me" body="At my shop, salon or studio" />
              <Choice on={workPlace === "home"} onClick={() => setWorkPlace("home")} icon={Car} title="I go to customers" body="Their home, hotel or event" />
              <Choice on={workPlace === "both"} onClick={() => setWorkPlace("both")} icon={Repeat} title="Both" body="Customers choose when they book" />
            </div>
            {workPlace && workPlace !== "shop" && (
              <div className="grid gap-4 rounded-card border border-line bg-surface-raised p-4">
                <div>
                  <span className="text-label mb-1.5 block">How far will you go?</span>
                  <div className="flex flex-wrap gap-2">
                    {(["area", "city", "state"] as TravelReach[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={reach === r}
                        onClick={() => setReach(r)}
                        className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold ${reach === r ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}
                      >
                        {reachLabel(r, business)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="f-fee" className="text-label mb-1.5 block">
                    Travel fee
                  </label>
                  <div className="flex h-13 items-center rounded-md border border-line-strong bg-surface-raised pl-4 focus-within:outline-2 focus-within:outline-brand">
                    <span className="text-ink-muted">₦</span>
                    <input
                      id="f-fee"
                      inputMode="numeric"
                      className="h-full min-w-0 flex-1 bg-transparent pr-2 pl-1 text-[17px] outline-none"
                      value={travelFee ? travelFee.toLocaleString("en-NG") : ""}
                      onChange={(e) => setTravelFee(Number(e.target.value.replace(/\D/g, "")) || 0)}
                    />
                  </div>
                  <p className="text-caption mt-1.5 text-ink-muted">Customers see it before they book.</p>
                </div>
              </div>
            )}
          </>
        )}

        {step === "rules" && (
          <>
            <Title title="Your booking rules" lead="Customers see these before they book. We wrote the usual ones. Tap any line to change it." />
            <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
              {rules.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-3 focus-within:outline-2 focus-within:outline-brand">
                  <CircleCheck size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  <textarea
                    aria-label={`Rule ${i + 1}`}
                    className="min-h-11 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-[22px] outline-none [field-sizing:content]"
                    value={r}
                    maxLength={240}
                    onChange={(e) => (setRulesTouched(true), setRules(rules.map((x, j) => (j === i ? e.target.value : x))))}
                  />
                  <button
                    type="button"
                    aria-label={`Remove rule ${i + 1}`}
                    className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center text-ink-muted"
                    onClick={() => (setRulesTouched(true), setRules(rules.filter((_, j) => j !== i)))}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {rules.length < 10 && (
              <button type="button" className="btn btn-secondary justify-self-start rounded-pill" onClick={() => (setRulesTouched(true), setRules([...rules, ""]))}>
                <Plus aria-hidden="true" /> Add a rule
              </button>
            )}
          </>
        )}

        {problem && (
          <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
            {problem}
          </p>
        )}
      </main>

      <div className="sticky bottom-0 z-10 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button type="button" className="btn btn-lg w-full rounded-pill" disabled={!ready || pending} onClick={next}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {step === "rules" ? "Save and open Today" : "Next"} {!pending && <ArrowRight aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function Title({ title, lead }: { title: string; lead?: string }) {
  return (
    <div>
      <h1 className="text-heading text-balance">{title}</h1>
      {lead && <p className="text-body-lg mt-1.5 text-ink-muted">{lead}</p>}
    </div>
  );
}

function Choice({ on, onClick, icon: Icon, title, body }: { on: boolean; onClick: () => void; icon: LucideIcon; title: string; body: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex min-h-18 w-full items-center gap-3.5 rounded-card border-2 px-4 py-3.5 text-left ${on ? "border-brand bg-brand-soft" : "border-line bg-surface-raised"}`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-pill ${on ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted"}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <span>
        <b className="block text-[17px]">{title}</b>
        <span className="text-caption text-ink-muted">{body}</span>
      </span>
    </button>
  );
}
