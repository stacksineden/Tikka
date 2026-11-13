"use client";

import { AlertTriangle, ArrowLeft, CalendarClock, Check, HeartHandshake, Loader2, Repeat, Sparkles, UserPlus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { publishDrop, saveDrop } from "@/app/app/actions";
import { ClaimPreview, type PreviewBusiness, type PreviewDrop } from "@/components/setup/ClaimPreview";
import { TextInput } from "@/components/setup/Fields";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import {
  AUDIENCE,
  bounceBackLabel,
  DAY_CHOICES,
  draftFromTemplate,
  dropItems,
  flowFor,
  ELIGIBILITY,
  FINISHES,
  LIMITS,
  newReward,
  ownOffer,
  rewardFromText,
  rewardLabel,
  RUN_CHOICES,
  setTotal,
  splitCondition,
  summary,
  tierCount,
  TIERS,
  validateStep1,
  validateStep2,
  validateStep3,
  watToIso,
  withDuration,
  withGoal,
  withThankYouFilled,
  type Days,
  type DraftReward,
  type DropDraft,
  type Errors,
  type Screen,
} from "@/lib/drop";
import { applyFix, dropCheck, suggestedSize } from "@/lib/dropcheck";
import { clockTime, count, shortDate } from "@/lib/format";
import { coveredBy, guaranteeLine, priceLabel, publishLabel, quoteDrop, type DropTier } from "@/lib/pricing";
import { daysLabel, GOALS, type DropTemplate, type Goal } from "@/lib/templates";
import type { Business, Tier } from "@/lib/types";
import { usable, type Voucher } from "@/lib/vouchers";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { SparkCard } from "@/components/spark/SparkTeaser";
import { LiveCard } from "./LiveCard";
import { TierStep, TIER_COPY } from "./TierStep";

/**
 * The drop builder (PRD B5), one decision per screen:
 *   goal → offer → (a ready-made offer: its three cards, each one tap from "Change")
 *                  (Make my own: Legendary, Rare and Thank-you, one screen each, the card shown as you type)
 *        → how many and when → check and publish.
 * Desktop shows the same steps, with the card beside the fields.
 */

const TITLES: Record<Screen, string> = {
  goal: "Create a drop",
  offer: "Create a drop",
  cards: "Your cards",
  legendary: "Legendary",
  rare: "Rare",
  thank_you: "Thank-you",
  when: "How many, and when",
  review: "Check and publish",
};

const GOAL_ICON: Record<Goal, LucideIcon> = { new_customers: UserPlus, bring_back: Repeat, quiet_days: CalendarClock };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WHEN_KEYS = ["total", "startsAt", "endsAt", "validityDays", "validWeekdays", "periodDays", "newReservedPct", "marketplaceCap"];

function whenLabel(iso: string) {
  return `${shortDate(iso)}, ${clockTime(iso)}`;
}

/** Only the errors for one tier's rewards (and the tier totals). */
function tierErrors(e: Errors, d: DropDraft, tier: Tier): Errors {
  const ids = d.rewards.filter((r) => r.tier === tier).map((r) => r.id);
  const out: Errors = {};
  for (const [k, v] of Object.entries(e)) if (k === "counts" || ids.some((id) => k.endsWith(`-${id}`))) out[k] = v;
  return out;
}

export function SimpleBuilder({
  initial,
  initialScreen,
  business,
  templates,
  tiers,
  vouchers,
  pastSuggest,
  editing,
  spark,
  pageClaims = false,
}: {
  initial: DropDraft;
  /** A saved draft reopens on the offer; "Run it again" opens on the last screen. */
  initialScreen: "goal" | "offer" | "review";
  business: Business;
  /** This business's category's ready-made offers, every goal. */
  templates: DropTemplate[];
  /** drop_tiers and this business's drops-without-paying, for the price preview. The server prices again at publish. */
  tiers: DropTier[];
  vouchers: Voucher[];
  /** A size suggested from the last drop's real numbers. */
  pastSuggest: { text: string; suggest: number } | null;
  editing: boolean;
  /** Spark's "coming soon" teaser (PRD B12); null once this business has hidden it. */
  spark: { onList: boolean } | null;
  /** Page-claim mode (lib/claim-mode.ts): show "Check WhatsApp at the counter". */
  pageClaims?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DropDraft>(initial);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  /** From "Your cards": changing one tier, then back. */
  const [changing, setChanging] = useState(false);
  /** An offer has been chosen (a saved draft always has one). */
  const [picked, setPicked] = useState(initialScreen !== "goal");
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  /** Publishing, not just saving a step (for the button's words). */
  const [publishing, setPublishing] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const main = useRef<HTMLElement>(null);

  const own = !draft.templateId;
  const flow = flowFor(own);
  const at = changing ? flow.indexOf("cards") : Math.max(0, flow.indexOf(screen));
  const isTier = screen === "legendary" || screen === "rare" || screen === "thank_you";

  const face = useMemo(() => ({ ...faceFromBusiness(business), verified: business.verified, prefix: business.codePrefix }), [business]);
  const filled = useMemo(() => withThankYouFilled(draft), [draft]);
  const items = useMemo(() => dropItems(filled), [filled]);
  const quote = quoteDrop(tiers, { vouchers, founding: business.foundingMember, now: new Date(openedAt) }, draft.total);
  const opensLabel = draft.startMode === "later" && draft.startsAt ? `Opens ${whenLabel(watToIso(draft.startsAt))}` : undefined;
  const expiry = shortDate(new Date(openedAt + draft.validityDays * 86_400_000).toISOString()).replace(/^\w+ /, "");
  const previewDrop: PreviewDrop = {
    total: draft.total || 1,
    left: draft.total || 1,
    items,
    note: draft.eligibility === "new_only" ? "Every Tikka holds something. New customers only." : "Every Tikka holds something. One per WhatsApp number.",
    finish: draft.finish,
    opensLabel,
    sample: items[0] ? { tier: items[0].tier, reward: items[0].reward } : undefined,
    expiry: shortDate(new Date(openedAt + draft.validityDays * 86_400_000).toISOString()),
  };

  /* ------------------------------------------------------------ edits */

  function update(next: DropDraft, touched: string[] = []) {
    setDraft(next);
    setSaved(false);
    if (touched.length)
      setErrors((e) => {
        const n = { ...e };
        for (const k of Object.keys(n)) if (touched.some((t) => k === t || k.endsWith(t))) delete n[k];
        return n;
      });
  }
  const patch = (p: Partial<DropDraft>) => update({ ...draft, ...p }, Object.keys(p));

  function setReward(id: string, next: DraftReward, countChanged = false) {
    let d: DropDraft = { ...draft, rewards: draft.rewards.map((r) => (r.id === id ? next : r)) };
    if (countChanged) d = withThankYouFilled({ ...d, mix: "custom" });
    update(d, [id, "counts"]);
  }

  /* ------------------------------------------------------- navigation */

  function show(s: Screen, isChanging = false) {
    setScreen(s);
    setChanging(isChanging);
    window.scrollTo({ top: 0 });
  }

  function showErrors(e: Errors) {
    setErrors(e);
    requestAnimationFrame(() => {
      main.current?.querySelector<HTMLElement>('[role="alert"], [aria-invalid="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  /** Saves the draft at every step, then moves on. A failed save never leaves the buttons stuck. */
  function persist(d: DropDraft, then: () => void) {
    start(async () => {
      try {
        const res = await saveDrop(d);
        if (!res.ok) return showErrors(res.errors);
        if (!d.id) {
          setDraft((x) => ({ ...x, id: res.id }));
          window.history.replaceState(null, "", `/app/drops/new?draft=${res.id}`);
        }
        setSaved(true);
        then();
      } catch {
        showErrors({ form: "We couldn't save. Check your connection and tap again." });
      }
    });
  }

  function pickGoal(goal: Goal) {
    const next = withGoal(draft, goal);
    // A new goal means new offers: forget the old one unless it was "Make my own".
    const keep = draft.templateId ? templates.find((t) => t.id === draft.templateId)?.goal === goal : true;
    const d = keep ? next : { ...next, templateId: undefined };
    if (!keep) setPicked(false);
    update(d);
    persist(d, () => show("offer"));
  }

  function errorsFor(s: Screen): Errors {
    const now = new Date();
    if (s === "offer") return picked ? {} : { offer: "Pick an offer, or make your own." };
    if (s === "legendary" || s === "rare" || s === "thank_you") return tierErrors(validateStep2(filled), draft, s);
    if (s === "cards") return validateStep2(filled);
    if (s === "when") {
      const rest = validateStep3(draft);
      delete rest.bounceBack;
      return { ...validateStep1({ ...draft, name: draft.name || "Drop" }, now), ...rest };
    }
    return {};
  }

  /** Where a publish error is fixed. */
  function screenFor(keys: string[]): { s: Screen; changing: boolean } {
    const rewardKey = keys.find((k) => /^(reward|count|terms)-/.test(k));
    if (rewardKey || keys.includes("counts")) {
      const id = rewardKey?.replace(/^\w+-/, "");
      const tier = draft.rewards.find((r) => r.id === id)?.tier ?? "legendary";
      return own ? { s: tier, changing: false } : { s: tier, changing: true };
    }
    if (keys.some((k) => WHEN_KEYS.includes(k))) return { s: "when", changing: false };
    return { s: "review", changing: false };
  }

  function next() {
    if (changing) {
      const e = errorsFor(screen);
      if (Object.keys(e).length) return showErrors(e);
      return persist(draft, () => show("cards"));
    }
    const e = errorsFor(screen);
    if (Object.keys(e).length) return showErrors(e);
    if (screen !== "review") return persist(draft, () => show(flow[at + 1]));

    if (!draft.name.trim()) return showErrors({ name: "Name your drop, e.g. December Glow." });
    setPublishing(true);
    start(async () => {
      try {
        const res = await publishDrop(draft);
        if (!res.ok) {
          setPublishing(false);
          const to = screenFor(Object.keys(res.errors));
          if (to.s !== screen) show(to.s, to.changing);
          return showErrors(res.errors);
        }
        router.push(res.published ? `/app/drops/${res.id}?published=1` : `/app/pay?payment=${res.paymentId}`);
      } catch {
        setPublishing(false);
        showErrors({ form: "We couldn't publish. Check your connection and tap again." });
      }
    });
  }

  function back() {
    if (changing) return show("cards");
    show(flow[Math.max(0, at - 1)]);
  }

  const forGoal = templates.filter((t) => t.goal === draft.goal);
  const last = screen === "review";
  const cta = publishing ? "Publishing…" : pending ? "Saving…" : changing ? "Done" : last ? publishLabel(quote) : "Continue";

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4">
          {screen !== "goal" ? (
            <button type="button" onClick={back} className="grid size-11 place-items-center rounded-md text-ink" aria-label="Back">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <Link href="/app/drops" className="grid size-11 place-items-center rounded-md text-ink" aria-label="Close">
              <X size={20} aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-label truncate">{changing ? `Change ${TIER_COPY[screen as Tier].word}` : screen === "goal" || screen === "offer" ? draft.name.trim() || (editing ? "Your draft" : TITLES[screen]) : TITLES[screen]}</div>
            <div className="text-caption text-ink-muted">
              {changing ? "Back to your cards when you're done" : `Step ${at + 1} of ${flow.length}`}
              {saved && !changing ? " · Draft saved" : ""}
            </div>
          </div>
        </div>
        <div className="h-1 bg-surface-sunken" aria-hidden="true">
          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${((at + 1) / flow.length) * 100}%` }} />
        </div>
      </header>

      <div className={`mx-auto grid w-full max-w-5xl flex-1 lg:gap-10 lg:px-4 lg:py-8 ${last ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        <main ref={main} className={`px-4 pt-6 lg:px-0 lg:pt-0 ${screen === "goal" ? "pb-10" : "pb-36 lg:pb-8"}`}>
          {screen === "goal" && (
            <Heading title="What do you want this drop to do?" body="Pick one. We'll suggest offers that work for it.">
              <StepGoal goal={draft.goal} chosen={!!draft.id} pending={pending} onPick={pickGoal} />
            </Heading>
          )}
          {screen === "offer" && (
            <Heading title="Start from an offer" body="Ready-made for your kind of business. Pick one and it's done, or change any word after.">
              <StepOffer
                draft={draft}
                picked={picked}
                templates={forGoal}
                errors={errors}
                spark={spark}
                onTemplate={(t) => {
                  setPicked(true);
                  if (draft.templateId !== t.id) {
                    update(draftFromTemplate(draft, t));
                    setErrors({});
                  } else setErrors((e) => ({ ...e, offer: undefined }));
                }}
                onOwn={() => {
                  setPicked(true);
                  if (draft.templateId || !picked) {
                    update(ownOffer(draft));
                    setErrors({});
                  } else setErrors((e) => ({ ...e, offer: undefined }));
                }}
              />
            </Heading>
          )}
          {screen === "cards" && (
            <Heading title="Your three cards" body="All filled in from the offer you picked. Happy? Continue. Want different words or numbers? Tap Change.">
              <StepCards filled={filled} draft={draft} errors={errors} face={face} expiry={expiry} onChange={(t) => show(t, true)} />
            </Heading>
          )}
          {isTier && (
            <TierStep
              tier={screen as Tier}
              draft={draft}
              filled={filled}
              errors={errors}
              templates={templates}
              face={face}
              expiry={expiry}
              onReward={setReward}
              onRemove={(id) => update(withThankYouFilled({ ...draft, mix: "custom", rewards: draft.rewards.filter((x) => x.id !== id) }), [id])}
            />
          )}
          {screen === "when" && (
            <Heading title="How many, and when?" body="We'll suggest a size from how many people see your posts.">
              <StepWhen
                draft={draft}
                errors={errors}
                tiers={tiers}
                vouchers={vouchers}
                business={business}
                pastSuggest={pastSuggest}
                openedAt={openedAt}
                update={update}
                patch={patch}
                pageClaims={pageClaims}
              />
            </Heading>
          )}
          {screen === "review" && (
            <Heading title="Your drop" body={summary(filled)}>
              <StepReview draft={draft} filled={filled} errors={errors} update={update} patch={patch} opensLabel={opensLabel} face={face} expiry={expiry} />
              <section className="grid gap-1 rounded-card border border-line bg-surface-raised p-4" aria-label="Price">
                <p className="text-title text-[17px]">
                  {quote.kind === "voucher" ? coveredBy(quote.voucher) : quote.kind === "paid" ? `${quote.tier.label} · ${priceLabel(quote.amountKobo)}` : "Talk to us"}
                </p>
                <p className="text-caption text-ink-muted">
                  {count(draft.total)} Tikkas{quote.kind === "paid" && business.foundingMember ? " · founding member price" : ""}
                </p>
                {guaranteeLine(quote) && <p className="text-body mt-1">{guaranteeLine(quote)}</p>}
              </section>
              <details className="rounded-card border border-line bg-surface-raised lg:hidden">
                <summary className="text-label flex min-h-12 cursor-pointer list-none items-center px-4 [&::-webkit-details-marker]:hidden">See your drop page</summary>
                <div className="border-t border-line p-2">
                  <ClaimPreview face={face} business={business as PreviewBusiness} prefix={business.codePrefix} drop={previewDrop} />
                </div>
              </details>
            </Heading>
          )}

          {errors.form && (
            <p role="alert" className="text-label mt-6 rounded-md bg-danger-soft px-3 py-2.5 text-danger">
              {errors.form}
            </p>
          )}
        </main>

        {last && (
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <ClaimPreview face={face} business={business as PreviewBusiness} prefix={business.codePrefix} drop={previewDrop} />
            </div>
          </aside>
        )}
      </div>

      {screen !== "goal" && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:static lg:border-0 lg:bg-transparent lg:pb-10 lg:pt-0">
          <div className={`mx-auto flex max-w-5xl items-center gap-3 ${last ? "lg:pr-[420px]" : ""}`}>
            <button type="button" onClick={next} disabled={pending || (last && quote.kind === "contact")} className="btn btn-lg w-full lg:ml-auto lg:w-auto lg:min-w-48">
              {pending && <Loader2 className="animate-spin" />}
              {cta}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Heading({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-heading">{title}</h1>
      <p className="text-body mt-1 text-ink-muted">{body}</p>
      <div className="mt-6 grid gap-6">{children}</div>
    </>
  );
}

/* ----------------------------------------------------------- the goal */

function StepGoal({ goal, chosen, pending, onPick }: { goal: Goal; chosen: boolean; pending: boolean; onPick: (g: Goal) => void }) {
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="What this drop is for">
      {GOALS.map((g) => {
        const Icon = GOAL_ICON[g.id];
        const on = chosen && goal === g.id;
        return (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending}
            onClick={() => onPick(g.id)}
            className={`flex min-h-24 items-center gap-4 rounded-card border p-4 text-left active:scale-[0.99] ${on ? "border-brand bg-brand-soft" : "border-line bg-surface-raised"}`}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
              <Icon size={24} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-title block text-[18px]">{g.label}</span>
              <span className="text-body block text-ink-muted">{g.note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- the offer */

function StepOffer({
  draft,
  picked,
  templates,
  errors,
  spark,
  onTemplate,
  onOwn,
}: {
  draft: DropDraft;
  picked: boolean;
  templates: DropTemplate[];
  errors: Errors;
  spark: { onList: boolean } | null;
  onTemplate: (t: DropTemplate) => void;
  onOwn: () => void;
}) {
  const ownOn = picked && !draft.templateId;
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2" role="radiogroup" aria-label="Offers">
        {templates.map((t) => {
          const on = picked && draft.templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onTemplate(t)}
              className={`grid gap-3 rounded-card border p-4 text-left ${on ? "border-2 border-brand bg-brand-soft p-[15px]" : "border-line bg-surface-raised"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-title block text-[17px]">{t.name}</span>
                  <span className="text-caption block text-ink-muted">{t.why}</span>
                </span>
                <span className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong"}`} aria-hidden="true">
                  {on && <Check size={14} strokeWidth={3.5} />}
                </span>
              </span>
              <span className="grid gap-1.5">
                {t.rewards.map((r, i) => (
                  <span key={`${r.tier}-${i}`} className="flex items-start gap-2">
                    <RarityBadge tier={r.tier} />
                    <span className="text-label min-w-0 pt-0.5">{rewardLabel({ ...r, ...splitCondition(r) })}</span>
                  </span>
                ))}
                {t.bounceBack && (
                  <span className="text-caption flex items-center gap-1.5 text-ink-muted">
                    <HeartHandshake size={14} aria-hidden="true" /> Next visit: {bounceBackLabel(t.bounceBack)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={ownOn}
          onClick={onOwn}
          className={`flex min-h-16 items-center gap-3 rounded-card border p-4 text-left ${ownOn ? "border-2 border-brand bg-brand-soft p-[15px]" : "border-dashed border-line-strong bg-surface-raised"}`}
        >
          <Sparkles size={20} className="shrink-0 text-brand" aria-hidden="true" />
          <span>
            <span className="text-title block text-[17px]">Make my own</span>
            <span className="text-caption block text-ink-muted">Write every reward yourself, one card at a time, and see each card as you type.</span>
          </span>
        </button>
      </div>
      {/* Spark isn't built yet: a "coming soon" teaser only, never a working suggestion (PRD B12). */}
      {spark && <SparkCard teaser="spark_builder" text="Not sure what to offer? Spark will help. Coming soon." onList={spark.onList} canAct />}
      {errors.offer && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
          {errors.offer}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------- a ready-made offer's cards */

function StepCards({
  draft,
  filled,
  errors,
  face,
  expiry,
  onChange,
}: {
  draft: DropDraft;
  filled: DropDraft;
  errors: Errors;
  face: React.ComponentProps<typeof LiveCard>["face"] & { prefix: string };
  expiry: string;
  onChange: (t: Tier) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {errors.counts && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger lg:col-span-3">
          {errors.counts}
        </p>
      )}
      {TIERS.map((tier) => {
        const rewards = filled.rewards.filter((r) => r.tier === tier);
        const first = rewards[0];
        if (!first) return null;
        const n = tierCount(filled, tier);
        const problem = Object.entries(tierErrors(errors, draft, tier)).find(([k]) => k !== "counts")?.[1];
        return (
          <div key={tier} className="flex items-center gap-4 overflow-hidden rounded-card bg-night p-3 text-on-night lg:flex-col lg:items-stretch lg:p-4" data-theme="light">
            <div className="shrink-0 [zoom:0.52] lg:self-center lg:[zoom:0.8]">
              <LiveCard reward={first} face={face} total={draft.total} finish={draft.finish} prefix={face.prefix} expiry={expiry} />
            </div>
            <div className="grid min-w-0 gap-1">
              <span className="text-title text-[17px]">{TIER_COPY[tier].word}</span>
              <span className="text-caption tabular-nums text-on-night-muted">
                {count(n)} Tikkas · {TIER_COPY[tier].share}
                {rewards.length > 1 ? ` · ${rewards.length} rewards` : ""}
              </span>
              {problem && (
                <span role="alert" className="text-caption font-semibold text-gold">
                  {problem}
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(tier)}
                className="text-label mt-2 min-h-11 justify-self-start rounded-pill border border-on-night/40 px-5 text-on-night"
              >
                Change
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------- how many and when */

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`text-label min-h-11 rounded-pill border px-4 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 bg-surface-raised text-ink"}`}
    >
      {children}
    </button>
  );
}

function StepWhen({
  draft,
  errors,
  tiers,
  vouchers,
  business,
  pastSuggest,
  openedAt,
  update,
  patch,
  pageClaims,
}: {
  draft: DropDraft;
  errors: Errors;
  tiers: DropTier[];
  vouchers: Voucher[];
  business: Business;
  pastSuggest: { text: string; suggest: number } | null;
  openedAt: number;
  update: (d: DropDraft, touched?: string[]) => void;
  patch: (p: Partial<DropDraft>) => void;
  pageClaims: boolean;
}) {
  const now = new Date(openedAt);
  const hasFree = vouchers.some((v) => v.source === "signup" && usable(v, now));
  const sizes = tiers.filter((t) => t.priceKobo > 0 || (t.id === "free" && hasFree)).sort((a, b) => a.maxCards - b.maxCards);
  const suggest = suggestedSize(draft) ?? pastSuggest?.suggest ?? null;
  const exact = !sizes.some((t) => t.maxCards === draft.total);
  const [showExact, setShowExact] = useState(exact);
  const setSize = (n: number) => update(setTotal(draft, n), ["total", "counts"]);
  const ctx = { vouchers, founding: business.foundingMember, now };
  const restart = (d: DropDraft) => update(withDuration(d, d.durationDays, new Date()), ["startsAt", "endsAt"]);

  return (
    <>
      <section className="grid gap-2" aria-labelledby="aud-h">
        <h2 id="aud-h" className="text-title text-[17px]">
          About how many people see what you post, on WhatsApp, Instagram or anywhere else?
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="aud-h">
          {AUDIENCE.map((a) => (
            <Chip key={a.id} on={draft.audienceBand === a.id} onClick={() => patch({ audienceBand: a.id })}>
              {a.label}
            </Chip>
          ))}
        </div>
        {pastSuggest && !draft.audienceBand && <p className="text-caption text-ink-muted">{pastSuggest.text}</p>}
      </section>

      <section className="grid gap-2" aria-labelledby="size-h">
        <h2 id="size-h" className="text-title text-[17px]">
          How many Tikkas?
        </h2>
        <div className="grid gap-2" role="radiogroup" aria-labelledby="size-h">
          {sizes.map((t) => {
            const q = quoteDrop(tiers, ctx, t.maxCards);
            const on = !showExact && draft.total === t.maxCards;
            const free = t.id === "free";
            const price = q.kind === "voucher" ? coveredBy(q.voucher) : q.kind === "paid" ? priceLabel(q.amountKobo) : "";
            const recommended = free ? !suggest || suggest <= t.maxCards : suggest !== null && suggest > (sizes[sizes.indexOf(t) - 1]?.maxCards ?? 0) && suggest <= t.maxCards;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setShowExact(false);
                  setSize(t.maxCards);
                }}
                className={`flex min-h-16 items-center gap-3 rounded-card border p-4 text-left ${on ? "border-brand bg-brand-soft" : "border-line bg-surface-raised"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-body block font-semibold">
                    {free ? "Free · your first drop" : t.label.replace(/ drop$/, "")} · up to {count(t.maxCards)}
                    {recommended && <span className="text-caption ml-2 rounded-pill bg-success-soft px-2 py-0.5 font-semibold text-success">Recommended</span>}
                  </span>
                  {hasFree && !free && suggest !== null && suggest > 200 && <span className="text-caption block text-ink-muted">With your audience, a bigger drop could fill.</span>}
                </span>
                <span className="text-label max-w-[9.5rem] shrink-0 text-right tabular-nums">{price}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={showExact}
            onClick={() => setShowExact(true)}
            className={`flex min-h-14 items-center rounded-card border p-4 text-left ${showExact ? "border-brand bg-brand-soft" : "border-line bg-surface-raised"}`}
          >
            <span className="text-body font-semibold">Exact number</span>
          </button>
          {showExact && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input w-32 text-center text-[18px] font-semibold tabular-nums"
                inputMode="numeric"
                aria-label="Number of Tikkas"
                value={draft.total || ""}
                aria-invalid={!!errors.total}
                onChange={(e) => setSize(Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0)}
              />
              <span className="text-body text-ink-muted">Tikkas</span>
            </div>
          )}
        </div>
        {errors.total && (
          <p role="alert" className="text-caption font-semibold text-danger">
            {errors.total}
          </p>
        )}
        <p className="text-caption text-ink-muted">Over 3,000? Talk to us and we&apos;ll set it up with you.</p>
        {draft.total >= LIMITS.minTotal && !errors.total && (
          <p className="text-body flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-surface-sunken p-3">
            <span className="font-semibold">{count(draft.total)} Tikkas:</span>
            {(
              [
                ["legendary", "Legendary", "bg-rarity-legendary"],
                ["rare", "Rare", "bg-rarity-rare"],
                ["thank_you", "Thank-you", "bg-rarity-common"],
              ] as const
            ).map(([tier, word, dot]) => (
              <span key={tier} className="inline-flex items-center gap-1.5 tabular-nums">
                <span className={`size-2 rounded-pill ${dot}`} aria-hidden="true" />
                {count(tierCount(withThankYouFilled(draft), tier))} {word}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="start-h">
        <h2 id="start-h" className="text-title text-[17px]">
          When does it start?
        </h2>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="start-h">
          {(
            [
              ["now", "As soon as I publish", "People can claim right away."],
              ["later", "On a date", "Share the link now. It opens when you say."],
            ] as const
          ).map(([mode, label, note]) => {
            const on = draft.startMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => restart({ ...draft, startMode: mode })}
                className={`grid gap-0.5 rounded-card border p-4 text-left ${on ? "border-2 border-brand bg-brand-soft p-[15px]" : "border-line bg-surface-raised"}`}
              >
                <span className="text-body font-semibold">{label}</span>
                <span className="text-caption text-ink-muted">{note}</span>
              </button>
            );
          })}
        </div>
        {draft.startMode === "later" && (
          <label className="grid gap-1.5">
            <span className="text-caption text-ink-muted">Opens (Nigeria time)</span>
            <input
              type="datetime-local"
              className="input"
              value={draft.startsAt}
              aria-invalid={!!errors.startsAt}
              onChange={(e) => restart({ ...draft, startsAt: e.target.value })}
            />
          </label>
        )}
        {errors.startsAt && (
          <p role="alert" className="text-caption font-semibold text-danger">
            {errors.startsAt}
          </p>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="dur-h">
        <h2 id="dur-h" className="text-title text-[17px]">
          Open for
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dur-h">
          {RUN_CHOICES.map((d) => (
            <Chip key={d} on={draft.durationDays === d} onClick={() => update(withDuration(draft, d, new Date()), ["endsAt"])}>
              {d} days
            </Chip>
          ))}
        </div>
        {errors.endsAt ? (
          <p role="alert" className="text-caption font-semibold text-danger">
            {errors.endsAt}
          </p>
        ) : (
          <p className="text-caption text-ink-muted">Closes {whenLabel(watToIso(draft.endsAt))}.</p>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="last-h">
        <h2 id="last-h" className="text-title text-[17px]">
          Each Tikka lasts
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="last-h">
          {DAY_CHOICES.map((d) => (
            <Chip key={d} on={draft.validityDays === d} onClick={() => patch({ validityDays: d as Days })}>
              {d} days
            </Chip>
          ))}
        </div>
        <p className="text-caption text-ink-muted">Counted from when each person claims, even after the drop closes.</p>
      </section>

      {draft.goal === "quiet_days" && (
        <section className="grid gap-2" aria-labelledby="days-h">
          <h2 id="days-h" className="text-title text-[17px]">
            Which days can people use it?
          </h2>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((name, i) => {
              const day = i + 1;
              const on = !!draft.validWeekdays?.includes(day);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const cur = draft.validWeekdays ?? [];
                    patch({ validWeekdays: on ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b) });
                  }}
                  className={`text-label min-h-11 min-w-14 rounded-pill border px-3 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 text-ink"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {errors.validWeekdays ? (
            <p role="alert" className="text-caption font-semibold text-danger">
              {errors.validWeekdays}
            </p>
          ) : (
            <p className="text-caption text-ink-muted">Codes only work on {daysLabel(draft.validWeekdays)}. Pick your slowest days.</p>
          )}
        </section>
      )}

      <MoreOptions draft={draft} errors={errors} patch={patch} pageClaims={pageClaims} />
    </>
  );
}

function MoreOptions({ draft, errors, patch, pageClaims }: { draft: DropDraft; errors: Errors; patch: (p: Partial<DropDraft>) => void; pageClaims: boolean }) {
  const open = !!(errors.periodDays || errors.newReservedPct || errors.marketplaceCap);
  return (
    <details className="group rounded-card border border-line bg-surface-raised" open={open || undefined}>
      <summary className="text-label flex min-h-12 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
        More options
        <span className="text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="grid gap-5 border-t border-line p-4">
        {pageClaims && (
          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
            <span className="grid gap-1">
              <span className="text-label">Check WhatsApp at the counter</span>
              <span className="text-caption text-ink-muted">While people type their number to claim, staff check it&apos;s really theirs before giving the reward.</span>
            </span>
            <input type="checkbox" checked={draft.counterCheck !== false} onChange={(e) => patch({ counterCheck: e.target.checked })} className="size-6 shrink-0 accent-[var(--brand)]" />
          </label>
        )}

        <fieldset className="grid gap-2">
          <legend className="text-label mb-2">Card style</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card style">
            {FINISHES.map((f) => (
              <Chip key={f.id} on={draft.finish === f.id} onClick={() => patch({ finish: f.id })}>
                {f.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-label mb-2">Who can claim</legend>
          <div className="grid gap-2" role="radiogroup" aria-label="Who can claim">
            {ELIGIBILITY.map((o) => (
              <Chip key={o.id} on={draft.eligibility === o.id} onClick={() => patch({ eligibility: o.id })}>
                {o.label}
              </Chip>
            ))}
          </div>
          {draft.eligibility === "once_per_period" && (
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-body">Once every</span>
              <input
                className="input w-24 text-center tabular-nums"
                inputMode="numeric"
                value={draft.periodDays || ""}
                aria-invalid={!!errors.periodDays}
                onChange={(e) => patch({ periodDays: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 })}
              />
              <span className="text-body">days</span>
            </label>
          )}
        </fieldset>

        <label className="grid gap-1.5">
          <span className="text-label">Share kept for new customers</span>
          <span className="flex items-center gap-2">
            <input
              className="input w-24 text-center tabular-nums"
              inputMode="numeric"
              value={draft.newReservedPct}
              aria-invalid={!!errors.newReservedPct}
              onChange={(e) => patch({ newReservedPct: Math.min(100, Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0) })}
            />
            <span className="text-body">%</span>
          </span>
        </label>

        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
          <span className="text-label">Show on the marketplace</span>
          <input type="checkbox" checked={draft.showOnMarketplace} onChange={(e) => patch({ showOnMarketplace: e.target.checked })} className="size-6 accent-[var(--brand)]" />
        </label>
        {draft.showOnMarketplace && (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-body">Most from the marketplace</span>
            <input
              className="input w-28 text-center tabular-nums"
              inputMode="numeric"
              placeholder="No limit"
              value={draft.marketplaceCap ?? ""}
              aria-invalid={!!errors.marketplaceCap}
              onChange={(e) => patch({ marketplaceCap: Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || null })}
            />
          </label>
        )}
        {errors.marketplaceCap && (
          <p role="alert" className="text-caption font-semibold text-danger">
            {errors.marketplaceCap}
          </p>
        )}
      </div>
    </details>
  );
}

/* -------------------------------------------------- check and publish */

function StepReview({
  draft,
  filled,
  errors,
  update,
  patch,
  opensLabel,
  face,
  expiry,
}: {
  draft: DropDraft;
  filled: DropDraft;
  errors: Errors;
  update: (d: DropDraft, t?: string[]) => void;
  patch: (p: Partial<DropDraft>) => void;
  opensLabel?: string;
  face: React.ComponentProps<typeof LiveCard>["face"] & { prefix: string };
  expiry: string;
}) {
  const warnings = dropCheck(draft);
  const shown = filled.rewards.filter((r) => r.count > 0);
  const rows: [string, string][] = [
    ["Goal", GOALS.find((g) => g.id === draft.goal)!.label],
    ["Opens", opensLabel ? opensLabel.replace(/^Opens /, "") : "As soon as you publish"],
    ["Closes", whenLabel(watToIso(draft.endsAt))],
    ["Each Tikka lasts", `${draft.validityDays} days after it's claimed`],
    ...(draft.goal === "quiet_days" ? ([["Works on", daysLabel(draft.validWeekdays)]] as [string, string][]) : []),
    ["Who can claim", ELIGIBILITY.find((e) => e.id === draft.eligibility)!.label],
  ];
  return (
    <>
      <div className="-mx-4 flex gap-3 overflow-x-auto bg-night px-4 py-4 lg:mx-0 lg:rounded-card" data-theme="light">
        {shown.map((r) => (
          <div key={r.id} className="grid shrink-0 gap-2">
            <div className="[zoom:0.6]">
              <LiveCard reward={r} face={face} total={draft.total} finish={draft.finish} prefix={face.prefix} expiry={expiry} />
            </div>
            <span className="text-caption font-semibold tabular-nums text-on-night">
              {count(r.count)} {TIER_COPY[r.tier].word}
            </span>
          </div>
        ))}
      </div>

      <section className="grid gap-2 rounded-card border border-line bg-surface-raised p-4" aria-labelledby="staff-h">
        <h2 id="staff-h" className="text-label">
          At the counter, staff see
        </h2>
        {shown.map((r) => (
          <p key={r.id} className="text-body">
            <b>{rewardLabel(r)}</b>
            {r.terms.trim() ? <span className="text-ink-muted"> · Only if: {r.terms.trim()}</span> : null}
          </p>
        ))}
      </section>

      <TextInput
        label="Drop name"
        value={draft.name}
        onChange={(v) => patch({ name: v })}
        error={errors.name}
        max={LIMITS.name}
        placeholder="e.g. December Glow"
        hint="Only you see this, in your dashboard and the share kit."
      />

      <NextVisit draft={draft} error={errors.bounceBack} patch={patch} />

      <section className="grid gap-2" aria-labelledby="check-h">
        <h2 id="check-h" className="text-title text-[17px]">
          The drop check
        </h2>
        {warnings.length === 0 ? (
          <p className="text-body flex items-center gap-2 rounded-md bg-success-soft px-3 py-3 text-success">
            <Check size={18} aria-hidden="true" /> Looks good. Nothing to fix.
          </p>
        ) : (
          <ul className="grid gap-2">
            {warnings.map((w) => (
              <li key={w.id} className="grid gap-2 rounded-md border border-line bg-surface-raised p-3">
                <p className="text-body flex gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold-text" aria-hidden="true" />
                  {w.text}
                </p>
                <button type="button" onClick={() => update(applyFix(draft, w.id), ["total", "counts"])} className="btn btn-secondary min-h-11 justify-self-start px-3 text-label">
                  {w.fix}
                </button>
              </li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && <p className="text-caption text-ink-muted">These are suggestions. You can still publish.</p>}
      </section>

      <dl className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="text-label text-ink-muted">{k}</dt>
            <dd className="text-body">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-ink-muted">After publishing you can extend the end date, add Tikkas or end the drop early, but not change the rewards.</p>
    </>
  );
}

/** "When they come in, send them a reason to come back": the next-visit Tikka, in plain words. */
function NextVisit({ draft, error, patch }: { draft: DropDraft; error?: string; patch: (p: Partial<DropDraft>) => void }) {
  const b = draft.bounceBack;
  const [text, setText] = useState(() => bounceBackLabel(b));
  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4" aria-labelledby="bb-h">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span id="bb-h" className="text-title block text-[17px]">
            Give them a reason to come back
          </span>
          <span className="text-caption block text-ink-muted">After you redeem their Tikka, we send a next-visit Tikka on WhatsApp.</span>
        </span>
        <input type="checkbox" role="switch" checked={b.on} onChange={(e) => patch({ bounceBack: { ...b, on: e.target.checked } })} className="peer sr-only" />
        <span
          className="relative h-7 w-12 shrink-0 rounded-pill bg-line-strong/50 transition-colors peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:size-5 after:rounded-pill after:bg-surface-raised after:transition-transform peer-checked:after:translate-x-5"
          aria-hidden="true"
        />
      </label>
      {b.on && (
        <TextInput
          label={`Next visit · within ${b.validityDays} days`}
          value={text}
          max={LIMITS.reward}
          placeholder="e.g. 10% off your next visit"
          error={error}
          onChange={(v) => {
            setText(v);
            const r = rewardFromText(newReward("rare"), v);
            patch({ bounceBack: { ...b, type: r.type, value: r.value, what: r.what, minSpend: r.minSpend } });
          }}
        />
      )}
    </section>
  );
}
