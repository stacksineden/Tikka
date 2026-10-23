"use client";

import { AlertTriangle, ArrowLeft, CalendarClock, Check, HeartHandshake, Loader2, Plus, Repeat, Sparkles, UserPlus, X, type LucideIcon } from "lucide-react";
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
  ELIGIBILITY,
  FINISHES,
  newReward,
  ownOffer,
  purchaseFor,
  rewardLabel,
  setTierCount,
  setTotal,
  summary,
  tierCount,
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
} from "@/lib/drop";
import { applyFix, dropCheck, suggestedSize } from "@/lib/dropcheck";
import { clockTime, count, shortDate } from "@/lib/format";
import { coveredBy, guaranteeLine, priceLabel, publishLabel, quoteDrop, type DropTier } from "@/lib/pricing";
import { daysLabel, GOALS, type DropTemplate, type Goal } from "@/lib/templates";
import type { Business, Tier } from "@/lib/types";
import { usable, type Voucher } from "@/lib/vouchers";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { RewardEditor } from "./RewardEditor";

const STEPS = [
  { title: "What do you want this drop to do?", body: "Pick one. We'll suggest offers that work for it." },
  { title: "Pick an offer", body: "Ready-made for your kind of business. Tap one to change the amounts." },
  { title: "How big, and for how long?", body: "We'll suggest a size from how many people see your posts." },
  { title: "Check and publish", body: "This is what people see when they open your link." },
];

const GOAL_ICON: Record<Goal, LucideIcon> = { new_customers: UserPlus, bring_back: Repeat, quiet_days: CalendarClock };
const TIER_NAME: Record<Tier, string> = { legendary: "Legendary · very few", rare: "Rare · some", thank_you: "Thank-you · everyone else" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function whenLabel(iso: string) {
  return `${shortDate(iso)}, ${clockTime(iso)}`;
}

export function SimpleBuilder({
  initial,
  initialStep,
  business,
  templates,
  tiers,
  vouchers,
  pastSuggest,
  editing,
}: {
  initial: DropDraft;
  /** "Run it again" opens on the last screen. */
  initialStep: number;
  business: Business;
  /** This business's category's ready-made offers, every goal. */
  templates: DropTemplate[];
  /** drop_tiers and this business's drops-without-paying, for the price preview. The server prices again at publish. */
  tiers: DropTier[];
  vouchers: Voucher[];
  /** A size suggested from the last drop's real numbers. */
  pastSuggest: { text: string; suggest: number } | null;
  editing: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DropDraft>(initial);
  const [step, setStep] = useState(initialStep);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [openedAt] = useState(() => Date.now());
  const main = useRef<HTMLElement>(null);
  const last = step === STEPS.length - 1;

  const face = useMemo(() => ({ ...faceFromBusiness(business), verified: business.verified }), [business]);
  const filled = useMemo(() => withThankYouFilled(draft), [draft]);
  const items = useMemo(() => dropItems(filled), [filled]);
  const quote = quoteDrop(tiers, { vouchers, founding: business.foundingMember, now: new Date(openedAt) }, draft.total);
  const opensLabel = draft.startMode === "later" && draft.startsAt ? `Opens ${whenLabel(watToIso(draft.startsAt))}` : undefined;
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

  function patchReward(id: string, p: Partial<DraftReward>) {
    let next: DropDraft = {
      ...draft,
      rewards: draft.rewards.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...p };
        return { ...merged, requiresPurchase: purchaseFor(merged) };
      }),
    };
    if (p.count !== undefined) next = withThankYouFilled({ ...next, mix: "custom" });
    update(next, [id, "counts"]);
  }

  /* ------------------------------------------------------- navigation */

  function goTo(n: number) {
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  function showErrors(e: Errors) {
    setErrors(e);
    requestAnimationFrame(() => {
      main.current?.querySelector<HTMLElement>('[role="alert"], [aria-invalid="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  /** Saves the draft at every step, then moves on. */
  function persist(d: DropDraft, then: () => void) {
    start(async () => {
      const res = await saveDrop(d);
      if (!res.ok) return showErrors(res.errors);
      if (!d.id) {
        setDraft((x) => ({ ...x, id: res.id }));
        window.history.replaceState(null, "", `/app/drops/new?draft=${res.id}`);
      }
      setSaved(true);
      then();
    });
  }

  function pickGoal(goal: Goal) {
    const next = withGoal(draft, goal);
    // A new goal means new offers: forget the old one unless it was "Make my own".
    const keep = draft.templateId ? templates.find((t) => t.id === draft.templateId)?.goal === goal : true;
    const d = keep ? next : { ...next, templateId: undefined };
    update(d);
    persist(d, () => goTo(1));
  }

  function next() {
    const now = new Date();
    const e =
      step === 1
        ? { ...validateStep2(filled), ...(draft.goal === "quiet_days" && !draft.validWeekdays?.length ? { validWeekdays: "Pick at least one day people can use it." } : {}), ...validateStep3(draft) }
        : step === 2
          ? validateStep1({ ...draft, name: draft.name || "Drop" }, now)
          : {};
    if (step === 1 && !draft.templateId && !draft.rewards.some((r) => r.what.trim() || r.value)) e.offer = "Pick an offer, or make your own.";
    if (Object.keys(e).length) return showErrors(e);
    if (!last) return persist(draft, () => goTo(step + 1));

    start(async () => {
      const res = await publishDrop(draft);
      if (!res.ok) {
        const keys = Object.keys(res.errors);
        const back = keys.some((k) => k.startsWith("reward") || k.startsWith("count") || k === "bounceBack" || k === "validWeekdays")
          ? 1
          : keys.some((k) => ["total", "startsAt", "endsAt", "validityDays", "periodDays", "newReservedPct", "marketplaceCap"].includes(k))
            ? 2
            : 3;
        if (back !== step) goTo(back);
        return showErrors(res.errors);
      }
      router.push(res.published ? `/app/drops/${res.id}?published=1` : `/app/pay?payment=${res.paymentId}`);
    });
  }

  const { title, body } = STEPS[step];
  const forGoal = templates.filter((t) => t.goal === draft.goal);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4">
          {step > 0 ? (
            <button type="button" onClick={() => goTo(step - 1)} className="grid size-11 place-items-center rounded-md text-ink" aria-label="Back">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <Link href="/app/drops" className="grid size-11 place-items-center rounded-md text-ink" aria-label="Close">
              <X size={20} aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-label truncate">{draft.name.trim() || (editing ? "Your draft" : "Create a drop")}</div>
            <div className="text-caption text-ink-muted">
              Step {step + 1} of {STEPS.length}
              {saved ? " · Draft saved" : ""}
            </div>
          </div>
        </div>
        <div className="h-1 bg-surface-sunken" aria-hidden="true">
          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <div className={`mx-auto grid w-full max-w-5xl flex-1 lg:gap-10 lg:px-4 lg:py-8 ${step === 3 ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        <main ref={main} className={`px-4 pt-6 lg:px-0 lg:pt-0 ${step === 0 ? "pb-10" : "pb-36 lg:pb-8"}`}>
          <h1 className="text-heading">{title}</h1>
          <p className="text-body mt-1 text-ink-muted">{body}</p>

          <div className="mt-6 grid gap-6">
            {step === 0 && <StepGoal goal={draft.goal} chosen={!!draft.id} pending={pending} onPick={pickGoal} />}
            {step === 1 && (
              <StepOffer
                draft={draft}
                filled={filled}
                templates={forGoal}
                errors={errors}
                onTemplate={(t) => update(draftFromTemplate(draft, t), ["offer"])}
                onOwn={() => update(ownOffer(draft), ["offer"])}
                patch={patch}
                patchReward={patchReward}
                update={update}
              />
            )}
            {step === 2 && (
              <StepSize draft={draft} errors={errors} tiers={tiers} vouchers={vouchers} business={business} pastSuggest={pastSuggest} openedAt={openedAt} update={update} patch={patch} />
            )}
            {step === 3 && (
              <>
                <div className="lg:hidden">
                  <ClaimPreview face={face} business={business as PreviewBusiness} prefix={business.codePrefix} drop={previewDrop} />
                </div>
                <StepCheck draft={draft} filled={filled} errors={errors} update={update} patch={patch} opensLabel={opensLabel} />
                <section className="grid gap-1 rounded-card border border-line bg-surface-raised p-4" aria-label="Price">
                  <p className="text-title text-[17px]">
                    {quote.kind === "voucher" ? coveredBy(quote.voucher) : quote.kind === "paid" ? `${quote.tier.label} · ${priceLabel(quote.amountKobo)}` : "Talk to us"}
                  </p>
                  <p className="text-caption text-ink-muted">
                    {count(draft.total)} Tikkas{quote.kind === "paid" && business.foundingMember ? " · founding member price" : ""}
                  </p>
                  {guaranteeLine(quote) && <p className="text-body mt-1">{guaranteeLine(quote)}</p>}
                </section>
              </>
            )}

            {errors.form && (
              <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
                {errors.form}
              </p>
            )}
          </div>
        </main>

        {step === 3 && (
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <ClaimPreview face={face} business={business as PreviewBusiness} prefix={business.codePrefix} drop={previewDrop} />
            </div>
          </aside>
        )}
      </div>

      {step > 0 && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:static lg:border-0 lg:bg-transparent lg:pb-10 lg:pt-0">
          <div className={`mx-auto flex max-w-5xl items-center gap-3 ${step === 3 ? "lg:pr-[420px]" : ""}`}>
            <button type="button" onClick={next} disabled={pending || (last && quote.kind === "contact")} className="btn btn-lg w-full lg:ml-auto lg:w-auto lg:min-w-48">
              {pending && <Loader2 className="animate-spin" />}
              {last ? (pending ? "Publishing…" : publishLabel(quote)) : pending ? "Saving…" : "Continue"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- screen 1 */

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

/* ----------------------------------------------------------- screen 2 */

function MiniOffer({ t, live }: { t: DropTemplate; live?: DraftReward[] }) {
  return (
    <div className="grid gap-1.5">
      {(live ?? t.rewards).map((r, i) => (
        <div key={`${r.tier}-${i}`} className="flex items-start gap-2">
          <RarityBadge tier={r.tier} />
          <span className="text-label min-w-0 pt-0.5">{rewardLabel(r)}</span>
        </div>
      ))}
      {t.bounceBack && (
        <p className="text-caption flex items-center gap-1.5 text-ink-muted">
          <HeartHandshake size={14} aria-hidden="true" /> Next visit: {bounceBackLabel(t.bounceBack)}
        </p>
      )}
    </div>
  );
}

function StepOffer({
  draft,
  filled,
  templates,
  errors,
  onTemplate,
  onOwn,
  patch,
  patchReward,
  update,
}: {
  draft: DropDraft;
  filled: DropDraft;
  templates: DropTemplate[];
  errors: Errors;
  onTemplate: (t: DropTemplate) => void;
  onOwn: () => void;
  patch: (p: Partial<DropDraft>) => void;
  patchReward: (id: string, p: Partial<DraftReward>) => void;
  update: (d: DropDraft, touched?: string[]) => void;
}) {
  const own = !draft.templateId && !!draft.id && draft.rewards.some((r) => r.what.trim() || r.value);
  const [ownOpen, setOwnOpen] = useState(own && !draft.templateId);
  const b = draft.bounceBack;

  return (
    <>
      <div className="grid gap-3" role="radiogroup" aria-label="Offers">
        {templates.map((t) => {
          const on = draft.templateId === t.id;
          return (
            <div key={t.id} className={`rounded-card border ${on ? "border-brand bg-brand-soft/40" : "border-line bg-surface-raised"}`}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setOwnOpen(false);
                  if (!on) onTemplate(t);
                }}
                className="grid w-full gap-3 p-4 text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-title block text-[17px]">{t.name}</span>
                    <span className="text-caption block text-ink-muted">{t.why}</span>
                  </span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong"}`}
                    aria-hidden="true"
                  >
                    {on && <Check size={14} strokeWidth={3.5} />}
                  </span>
                </span>
                <MiniOffer t={t} live={on ? draft.rewards : undefined} />
              </button>
              {on && (
                <div className="grid gap-3 border-t border-line p-4">
                  <p className="text-label">Change the amounts</p>
                  {draft.rewards.map((r) => (
                    <PlainReward key={r.id} reward={r} error={errors[`reward-${r.id}`]} onChange={(p) => patchReward(r.id, p)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={ownOpen}
          onClick={() => {
            if (!ownOpen) onOwn();
            setOwnOpen(true);
          }}
          className={`flex min-h-16 items-center gap-3 rounded-card border p-4 text-left ${ownOpen ? "border-brand bg-brand-soft/40" : "border-dashed border-line-strong bg-surface-raised"}`}
        >
          <Sparkles size={20} className="shrink-0 text-brand" aria-hidden="true" />
          <span>
            <span className="text-title block text-[17px]">Make my own</span>
            <span className="text-caption block text-ink-muted">Choose every reward yourself.</span>
          </span>
        </button>
      </div>
      {errors.offer && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
          {errors.offer}
        </p>
      )}

      {ownOpen && <OwnRewards draft={draft} filled={filled} errors={errors} patchReward={patchReward} update={update} />}

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

      <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4" aria-labelledby="bb-h">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span id="bb-h" className="text-title block text-[17px]">
              When they come in, send them a reason to come back
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
          <>
            <PlainReward
              reward={{ ...newReward("rare"), id: "bounce", type: b.type, value: b.value, what: b.what, minSpend: b.minSpend }}
              label={`Next visit · within ${b.validityDays} days`}
              error={errors.bounceBack}
              onChange={(p) => patch({ bounceBack: { ...b, ...("value" in p ? { value: p.value ?? null } : {}), ...("what" in p ? { what: p.what ?? "" } : {}), ...("minSpend" in p ? { minSpend: p.minSpend ?? null } : {}) } })}
            />
          </>
        )}
      </section>
    </>
  );
}

/** One reward as plain fields: the amount, what it's off, and an optional minimum spend. */
function PlainReward({ reward: r, onChange, error, label }: { reward: DraftReward; onChange: (p: Partial<DraftReward>) => void; error?: string; label?: string }) {
  const num = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 9);
    return d ? Number(d) : null;
  };
  const discount = r.type === "percent_off" || r.type === "naira_off";
  return (
    <div className="grid gap-2">
      <span className="text-caption font-semibold text-ink-muted">{label ?? TIER_NAME[r.tier]}</span>
      {discount ? (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
          <div className="relative">
            {r.type === "naira_off" && (
              <span className="text-body pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
                ₦
              </span>
            )}
            <input
              className={`input tabular-nums ${r.type === "naira_off" ? "pl-7" : "pr-8"}`}
              inputMode="numeric"
              value={r.value ?? ""}
              aria-label={r.type === "percent_off" ? "Percentage off" : "Naira off"}
              aria-invalid={!!error}
              onChange={(e) => onChange({ value: num(e.target.value) })}
            />
            {r.type === "percent_off" && (
              <span className="text-body pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
                %
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-body shrink-0 text-ink-muted">off</span>
            <input className="input min-w-0" value={r.what} aria-label="Off what" onChange={(e) => onChange({ what: e.target.value })} />
          </div>
        </div>
      ) : (
        <textarea
          className="input min-h-11 resize-none py-2.5 leading-6 [field-sizing:content]"
          rows={1}
          value={r.what}
          aria-label="What they get"
          aria-invalid={!!error}
          onChange={(e) => onChange({ what: e.target.value.replace(/\n/g, " ") })}
        />
      )}
      {discount && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-muted">When they spend over</span>
          <span className="relative">
            <span className="text-body pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
              ₦
            </span>
            <input
              className="input h-11 w-32 pl-7 tabular-nums"
              inputMode="numeric"
              placeholder="Optional"
              value={r.minSpend ?? ""}
              aria-label="Minimum spend in naira"
              onChange={(e) => onChange({ minSpend: num(e.target.value) })}
            />
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Make my own": the full tier editor. */
function OwnRewards({
  draft,
  filled,
  errors,
  patchReward,
  update,
}: {
  draft: DropDraft;
  filled: DropDraft;
  errors: Errors;
  patchReward: (id: string, p: Partial<DraftReward>) => void;
  update: (d: DropDraft, touched?: string[]) => void;
}) {
  function addReward(tier: Tier) {
    const current = tierCount(draft, tier);
    const added = { ...draft, mix: "custom" as const, rewards: [...draft.rewards.map((r) => (r.tier === tier ? { ...r, count: 1 } : r)), newReward(tier, { count: 1 })] };
    update(withThankYouFilled(setTierCount(added, tier, current)), ["counts"]);
  }
  return (
    <section className="grid gap-5" aria-label="Your rewards">
      <p className="text-label rounded-md bg-surface-sunken px-3 py-2.5 tabular-nums" aria-live="polite">
        {summary(filled)}
      </p>
      {errors.counts && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {errors.counts}
        </p>
      )}
      {(["legendary", "rare", "thank_you"] as Tier[]).map((tier) => {
        const rewards = filled.rewards.filter((r) => r.tier === tier);
        return (
          <div key={tier} className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-label">{TIER_NAME[tier]}</span>
              {tier !== "thank_you" && (
                <button type="button" onClick={() => addReward(tier)} className="text-label inline-flex min-h-11 items-center gap-1 text-brand">
                  <Plus size={16} aria-hidden="true" /> Add another
                </button>
              )}
            </div>
            {rewards.map((r) => (
              <RewardEditor
                key={r.id}
                reward={r}
                total={draft.total}
                showCount={tier !== "thank_you"}
                onChange={(p) => patchReward(r.id, p)}
                onRemove={
                  tier !== "thank_you" && rewards.length > 1
                    ? () => update(withThankYouFilled({ ...draft, mix: "custom", rewards: draft.rewards.filter((x) => x.id !== r.id) }), [r.id])
                    : undefined
                }
                error={errors[`reward-${r.id}`]}
                countError={errors[`count-${r.id}`]}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------- screen 3 */

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

function StepSize({
  draft,
  errors,
  tiers,
  vouchers,
  business,
  pastSuggest,
  openedAt,
  update,
  patch,
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
}) {
  const now = new Date(openedAt);
  const hasFree = vouchers.some((v) => v.source === "signup" && usable(v, now));
  const sizes = tiers.filter((t) => t.priceKobo > 0 || (t.id === "free" && hasFree)).sort((a, b) => a.maxCards - b.maxCards);
  const suggest = suggestedSize(draft) ?? pastSuggest?.suggest ?? null;
  const exact = !sizes.some((t) => t.maxCards === draft.total);
  const [showExact, setShowExact] = useState(exact);
  const setSize = (n: number) => update(setTotal(draft, n), ["total", "counts"]);
  const ctx = { vouchers, founding: business.foundingMember, now };

  return (
    <>
      <section className="grid gap-2" aria-labelledby="aud-h">
        <h2 id="aud-h" className="text-title text-[17px]">
          About how many people see your WhatsApp status or Instagram posts?
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
                  {hasFree && !free && suggest !== null && suggest > 200 && (
                    <span className="text-caption block text-ink-muted">With your audience, a bigger drop could fill.</span>
                  )}
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
      </section>

      <section className="grid gap-2" aria-labelledby="dur-h">
        <h2 id="dur-h" className="text-title text-[17px]">
          Drop runs for
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dur-h">
          {DAY_CHOICES.map((d) => (
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
          <p className="text-caption text-ink-muted">Ends {whenLabel(watToIso(draft.endsAt))}.</p>
        )}
      </section>

      <MoreOptions draft={draft} errors={errors} update={update} patch={patch} />
    </>
  );
}

function MoreOptions({ draft, errors, update, patch }: { draft: DropDraft; errors: Errors; update: (d: DropDraft, t?: string[]) => void; patch: (p: Partial<DropDraft>) => void }) {
  const open = !!(errors.startsAt || errors.periodDays || errors.newReservedPct || errors.marketplaceCap || errors.validityDays);
  return (
    <details className="group rounded-card border border-line bg-surface-raised" open={open || undefined}>
      <summary className="text-label flex min-h-12 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
        More options
        <span className="text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="grid gap-5 border-t border-line p-4">
        <fieldset className="grid gap-2">
          <legend className="text-label mb-2">Starts</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Starts">
            <Chip on={draft.startMode === "now"} onClick={() => update(withDuration({ ...draft, startMode: "now" }, draft.durationDays, new Date()), ["startsAt", "endsAt"])}>
              As soon as I publish
            </Chip>
            <Chip on={draft.startMode === "later"} onClick={() => update(withDuration({ ...draft, startMode: "later" }, draft.durationDays, new Date()), ["startsAt", "endsAt"])}>
              On a date
            </Chip>
          </div>
          {draft.startMode === "later" && (
            <input
              type="datetime-local"
              className="input"
              aria-label="Opens (Nigeria time)"
              value={draft.startsAt}
              aria-invalid={!!errors.startsAt}
              onChange={(e) => update(withDuration({ ...draft, startsAt: e.target.value }, draft.durationDays, new Date()), ["startsAt", "endsAt"])}
            />
          )}
          {errors.startsAt && (
            <p role="alert" className="text-caption font-semibold text-danger">
              {errors.startsAt}
            </p>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-label mb-2">Each Tikka lasts</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Each Tikka lasts">
            {DAY_CHOICES.map((d) => (
              <Chip key={d} on={draft.validityDays === d} onClick={() => patch({ validityDays: d as Days })}>
                {d} days
              </Chip>
            ))}
          </div>
          <p className="text-caption text-ink-muted">Counted from when each person claims, even after the drop ends.</p>
        </fieldset>

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

/* ----------------------------------------------------------- screen 4 */

function StepCheck({
  draft,
  filled,
  errors,
  update,
  patch,
  opensLabel,
}: {
  draft: DropDraft;
  filled: DropDraft;
  errors: Errors;
  update: (d: DropDraft, t?: string[]) => void;
  patch: (p: Partial<DropDraft>) => void;
  opensLabel?: string;
}) {
  const warnings = dropCheck(draft);
  const rows: [string, string][] = [
    ["Goal", GOALS.find((g) => g.id === draft.goal)!.label],
    ["Size", summary(filled)],
    ["Opens", opensLabel ? opensLabel.replace(/^Opens /, "") : "As soon as you publish"],
    ["Ends", whenLabel(watToIso(draft.endsAt))],
    ["Each Tikka lasts", `${draft.validityDays} days after it's claimed`],
    ...(draft.goal === "quiet_days" ? ([["Works on", daysLabel(draft.validWeekdays)]] as [string, string][]) : []),
    ["Next visit", draft.bounceBack.on ? bounceBackLabel(draft.bounceBack) : "Off"],
    ["Who can claim", ELIGIBILITY.find((e) => e.id === draft.eligibility)!.label],
  ];
  return (
    <>
      <TextInput
        label="Drop name"
        value={draft.name}
        onChange={(v) => patch({ name: v })}
        error={errors.name}
        max={40}
        placeholder="e.g. December Glow"
        hint="Only you see this, in your dashboard and the share kit."
      />

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
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-label text-ink-muted">Inside</dt>
          <dd className="grid gap-2">
            {dropItems(filled).map((it) => (
              <div key={it.tier + it.reward} className="flex flex-wrap items-center gap-2">
                <span className="text-code font-mono">{count(it.count)}×</span>
                <span className="text-body">{it.reward}</span>
                <RarityBadge tier={it.tier} />
              </div>
            ))}
          </dd>
        </div>
      </dl>
      <p className="text-caption text-ink-muted">After publishing you can extend the end date, add Tikkas or end the drop early, but not change the rewards.</p>
    </>
  );
}

