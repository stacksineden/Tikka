"use client";

// NEW DIRECTION, stage 1 (docs/OWNER_JOURNEYS.md journey 1, prototype design/prototypes/owner-v2.html):
// one question per screen, filled in for the owner's trade and city. Demo store only for now.

import {
  ArmchairIcon,
  ArrowLeft,
  ArrowRight,
  Camera,
  Clapperboard,
  Car,
  Check,
  CircleCheck,
  Clock,
  Crown,
  ExternalLink,
  Eye,
  Flower2,
  Hand,
  ImagePlus,
  Loader2,
  Palette,
  PartyPopper,
  Plus,
  Repeat,
  Scissors,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Type,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addPhoto } from "@/app/app/actions";
import { MIN_DEPOSIT_PERCENT, PercentInput } from "@/components/today/Sheet";
import { saveStartMoney, saveStartPage, type StartPage } from "@/app/app/start/actions";
import { prepareLogo, preparePortfolio, uploadMedia, uploadPhoto } from "@/lib/media-client";
import { CardPreview } from "@/components/setup/CardPreview";
import { draftToFace } from "@/components/setup/SetupFlow";
import { BRAND_SWATCHES, checkBrandColor, colorName, parseColor, SWATCHES } from "@/lib/color";
import { ServicesEditor, serviceProblem } from "./ServicesEditor";
import { citiesFor, STATE_NAMES } from "@/lib/nigeria";
import {
  depositOn,
  EVENT_DEPOSIT_PERCENT,
  presetRules,
  presetServices,
  reachLabel,
  farTripHint,
  TRAVEL_REACHES,
  START_HOURS,
  SUGGESTED_DEPOSIT_PERCENT,
  TRADES,
  tradeCategory,
  travelFeeFor,
  type PresetExtra,
  type PresetService,
  type TradeId,
} from "@/lib/presets";
import { initialsFrom, normalizeNgPhone, suggestPrefix } from "@/lib/setup";
import type { OpeningHours, PortfolioPhoto, TravelReach, WorkPlace } from "@/lib/types";

const TRADE_ICONS: Record<TradeId, LucideIcon> = { hair: Scissors, makeup: Sparkles, nails: Hand, lashes: Eye, barber: UserRound, spa: Flower2, gele: Crown, photo: Camera, video: Video, content: Clapperboard };
const BANKS = ["Access Bank", "First Bank", "GTBank", "Kuda", "Moniepoint", "Opay", "Palmpay", "UBA", "Zenith Bank"];
const ID_TYPES = ["NIN slip", "Driver's licence", "Voter's card", "International passport"];
const MIN_PHOTOS = 3;
type SocialKey = "instagram" | "tiktok" | "facebook";
const SOCIALS: [SocialKey, string, string][] = [
  ["instagram", "Instagram", "@adashairstudio"],
  ["tiktok", "TikTok", "@adashair"],
  ["facebook", "Facebook", "Page name or link"],
];

type Step = "trade" | "name" | "look" | "where" | "work" | "services" | "photos" | "hours" | "live" | "id" | "bank" | "deposit" | "rules" | "done";
const STEPS: Step[] = ["trade", "name", "look", "where", "work", "services", "photos", "hours", "live", "id", "bank", "deposit", "rules", "done"];
// Real accounts add their ID, bank and deposit on the real Get paid screens (an admin checks the ID),
// so their setup goes from the live page straight to the booking rules.
const REAL_STEPS: Step[] = STEPS.filter((s) => s !== "id" && s !== "bank" && s !== "deposit");

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const digits = (s: string) => Number(s.replace(/\D/g, "")) || 0;

export function StartFlow({ real = false, ownerName = "" }: { real?: boolean; ownerName?: string }) {
  const steps = real ? REAL_STEPS : STEPS;
  const [step, setStep] = useState<Step>("trade");
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string>();

  // The business
  const [trades, setTrades] = useState<TradeId[]>([]);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [socials, setSocials] = useState<Partial<Record<SocialKey, string>>>({ instagram: "" });
  const [brandColor, setBrandColor] = useState<string>(SWATCHES[0].hex);
  const [logoUrl, setLogoUrl] = useState<string>();
  // "Do you have a logo?" asked plainly: yes (then add it) or not yet (initials show).
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);
  const [colorText, setColorText] = useState("");
  const [tagline, setTagline] = useState("");
  const [state, setState] = useState("Oyo");
  const [city, setCity] = useState("Ibadan");
  const [area, setArea] = useState("");
  const [workPlace, setWorkPlace] = useState<WorkPlace | null>(null);
  const [travelFee, setTravelFee] = useState(travelFeeFor("Oyo"));
  const [reach, setReach] = useState<TravelReach>("city");
  const [services, setServices] = useState<PresetService[]>([]);
  const [extras, setExtras] = useState<PresetExtra[]>([]);
  const [seededFor, setSeededFor] = useState("");
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [uploading, setUploading] = useState(0);
  const [hours, setHours] = useState<OpeningHours>(START_HOURS);
  const [capacity, setCapacity] = useState(1);
  const [slug, setSlug] = useState("");

  // Money (ID and bank are pretend in the demo)
  const [idType, setIdType] = useState(ID_TYPES[0]);
  const [idName, setIdName] = useState("");
  const [idPhoto, setIdPhoto] = useState(false);
  const [registered, setRegistered] = useState<"no" | "yes">("no");
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [accountOk, setAccountOk] = useState(false);
  const [depositMode, setDepositMode] = useState<"percent" | "fixed">("percent");
  const [depositPercent, setDepositPercent] = useState(SUGGESTED_DEPOSIT_PERCENT);
  const [depositFixed, setDepositFixed] = useState(5000);
  const [counts, setCounts] = useState(true);
  const [rules, setRules] = useState<string[] | null>(null);

  const index = steps.indexOf(step);
  const go = (s: Step) => {
    setProblem(undefined);
    setStep(s);
    window.scrollTo(0, 0);
  };
  const back = () => index > 0 && go(steps[index - 1]);

  function seed() {
    const key = `${trades.join(",")}|${state}`;
    if (key === seededFor) return;
    const p = presetServices(trades, state);
    setServices(p.services);
    setExtras(p.extras);
    setSeededFor(key);
  }

  const pageInput = (): StartPage => ({
    trades,
    name,
    whatsapp,
    socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => v && v.trim())),
    brandColor,
    logoUrl,
    tagline,
    state,
    city,
    area,
    workPlace: workPlace ?? "shop",
    travelFee,
    travelReach: reach,
    services: services.filter((s) => s.on).map((s) => s.item),
    extras: extras.filter((x) => x.on).map(({ name: n, price }) => ({ name: n, price })),
    hours,
    capacity,
  });

  function savePage(then: Step) {
    start(async () => {
      const r = await saveStartPage(pageInput());
      if (!r.ok) return setProblem(r.error);
      setSlug(r.slug);
      go(then);
    });
  }

  function saveMoney() {
    start(async () => {
      const deposit = depositMode === "fixed" ? { mode: "fixed" as const, amount: depositFixed, counts } : { mode: "percent" as const, percent: depositPercent, counts };
      const r = await saveStartMoney({ ownerName: idName, deposit: real ? undefined : deposit, rules: rules ?? [] });
      if (!r.ok) return setProblem(r.error);
      go("done");
    });
  }

  function next() {
    switch (step) {
      case "work":
        seed();
        return go("services");
      case "services":
        // The page exists from here, so photos have somewhere to go.
        return savePage("photos");
      case "hours":
        return savePage("live");
      case "deposit":
        if (!rules) setRules(presetRules(workPlace ?? "shop", services.some((s) => s.on && s.item.eventDay)));
        return go("rules");
      case "live":
        if (!real) return go("id");
        if (!rules) setRules(presetRules(workPlace ?? "shop", services.some((s) => s.on && s.item.eventDay)));
        return go("rules");
      case "rules":
        return saveMoney();
      default:
        return go(steps[index + 1]);
    }
  }

  const ready: Record<Step, boolean> = {
    trade: trades.length > 0,
    name: name.trim().length > 1 && !!normalizeNgPhone(whatsapp),
    where: !!state && !!city.trim() && !!area.trim(),
    work: !!workPlace,
    services: services.some((s) => s.on) && services.every((s) => !s.on || !serviceProblem(s.item)),
    look: hasLogo === false || (hasLogo === true && !!logoUrl),
    photos: photos.length >= MIN_PHOTOS && !uploading,
    hours: Object.values(hours).some((d) => d.open),
    live: true,
    id: idName.trim().length > 2 && idPhoto,
    bank: accountOk,
    deposit: depositMode === "fixed" ? depositFixed > 0 : depositPercent >= MIN_DEPOSIT_PERCENT,
    rules: true,
    done: true,
  };
  const label: Partial<Record<Step, string>> = { live: real ? "Add my booking rules" : "Take deposits", id: "Send my ID", deposit: "Use this deposit", rules: "Save my rules", hours: "Put my page live" };

  async function addLogo(file: File | undefined) {
    if (!file) return;
    setProblem(undefined);
    try {
      setLogoUrl(await uploadMedia(await (await fetch(await prepareLogo(file))).blob(), "logo"));
    } catch (e) {
      setProblem((e as Error).message);
    }
  }

  const face = draftToFace({
    name,
    category: tradeCategory(trades),
    state,
    city,
    area,
    brandColor,
    logoUrl,
    background: { type: "color" },
    actions: [],
    codePrefix: suggestPrefix(name),
    tagline,
  });

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setProblem(undefined);
    const picked = [...files].slice(0, 20 - photos.length);
    setUploading(picked.length);
    for (const file of picked) {
      try {
        const prepared = await preparePortfolio(file);
        const [url, thumbUrl] = await Promise.all([uploadPhoto(prepared.url, "portfolio"), uploadPhoto(prepared.thumbUrl, "portfolio")]);
        const r = await addPhoto({ url, thumbUrl, ...prepared.details });
        if (!r.ok) {
          setProblem(r.error);
          break;
        }
        setPhotos(r.portfolio);
      } catch (e) {
        setProblem((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const pct = Math.round((index / (steps.length - 1)) * 100);
  const sampleSvc = useMemo(() => services.find((s) => s.on && !s.item.eventDay) ?? services.find((s) => s.on), [services]);
  const samplePrice = sampleSvc ? (sampleSvc.item.options ? sampleSvc.item.options[sampleSvc.item.options.length - 1].price : sampleSvc.item.price ?? 0) : 20000;
  const sampleDeposit = depositOn(samplePrice, depositMode === "fixed" ? { mode: "fixed", amount: depositFixed } : { mode: "percent", percent: depositPercent });
  // The owner's own name: from their account (real), or the demo's ID step.
  const firstName = (real ? ownerName.trim() : idName.trim()).split(/\s+/)[0] || "there";
  const noun = TRADES.find((t) => t.id === trades[0])?.noun ?? "beauty";

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface">
      {step !== "done" && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-2 py-2">
          <button type="button" onClick={back} disabled={index === 0} aria-label="Back" className="grid size-11 place-items-center rounded-pill disabled:opacity-0">
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken" role="progressbar" aria-label="Setup progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-pill bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {slug && index > STEPS.indexOf("services") ? (
            <Link href={`/${slug}`} target="_blank" className="text-label flex min-h-11 items-center gap-1 px-2 text-brand">
              <Eye size={16} aria-hidden="true" /> See page
            </Link>
          ) : (
            <span className="w-11" />
          )}
        </div>
      )}

      <main className="grid flex-1 content-start gap-5 px-4 pt-5 pb-6">
        {step === "trade" && (
          <>
            <Title title="What do you do?" lead="Pick all that apply. We'll fill in your page for you." />
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

        {step === "name" && (
          <>
            <Title title="What's your business called?" lead="This goes at the top of your page." />
            <Field id="s-name" label="Business name">
              <input id="s-name" className="input h-13 text-[17px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada's Hair Studio" maxLength={40} autoComplete="organization" />
            </Field>
            <Field id="s-wa" label="Your WhatsApp number" hint="Customers message you here from your page.">
              <input id="s-wa" className="input h-13 text-[17px]" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="0803 000 0000" autoComplete="tel-national" />
            </Field>
            <div>
              <span className="text-label mb-1.5 block">Where customers find you (if you use them)</span>
              <div className="grid gap-2">
                {SOCIALS.map(([k, label, ph]) =>
                  socials[k] !== undefined ? (
                    <div key={k} className="flex h-13 items-center rounded-md border border-line-strong bg-surface-raised pl-4 focus-within:outline-2 focus-within:outline-brand">
                      <span className="text-caption w-20 shrink-0 text-ink-muted">{label}</span>
                      <input
                        aria-label={`${label} username or link`}
                        className="h-full min-w-0 flex-1 bg-transparent px-1 text-[17px] outline-none"
                        value={socials[k]}
                        onChange={(e) => setSocials({ ...socials, [k]: e.target.value })}
                        placeholder={ph}
                        autoCapitalize="off"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${label}`}
                        className="grid size-11 shrink-0 place-items-center text-ink-muted"
                        onClick={() => {
                          const next = { ...socials };
                          delete next[k];
                          setSocials(next);
                        }}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {SOCIALS.filter(([k]) => socials[k] === undefined).map(([k, label]) => (
                  <Chip key={k} on={false} onClick={() => setSocials({ ...socials, [k]: "" })}>
                    + {label}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}

        {step === "look" && (
          <>
            <Title title="Your logo and brand colour" lead="They go on your page, your buttons and the cards customers get when you run drops." />
            <CardPreview face={face} prefix={suggestPrefix(name)} compact />
            <div className="grid gap-2.5">
              <span className="text-label">Do you have a logo?</span>
              <Choice on={hasLogo === true} onClick={() => setHasLogo(true)} icon={ImagePlus} title="Yes, I have a logo" body="Add it and it shows on your page and cards" />
              <Choice on={hasLogo === false} onClick={() => setHasLogo(false)} icon={Type} title="Not yet" body={`Your initials show instead (${initialsFrom(name) || "AB"}). Add a logo any time.`} />
              {hasLogo && (
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-3">
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill text-xl font-extrabold" style={{ background: brandColor, color: checkBrandColor(brandColor).on }}>
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- demo media from memory
                      <img src={logoUrl} alt="Your logo" className="size-full object-cover" />
                    ) : (
                      initialsFrom(name) || "AB"
                    )}
                  </span>
                  <label className="btn btn-secondary relative cursor-pointer rounded-pill">
                    <ImagePlus aria-hidden="true" /> {logoUrl ? "Change logo" : "Add your logo"}
                    <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => addLogo(e.target.files?.[0])} />
                  </label>
                </div>
              )}
            </div>
            <div className="grid gap-2.5">
              <div>
                <span className="text-label block">Your brand colour</span>
                <span className="text-caption text-ink-muted">The colour people know your business by. Pick one, or type your own.</span>
              </div>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Brand colours">
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    role="radio"
                    aria-label={c.name}
                    aria-checked={brandColor === c.hex}
                    onClick={() => (setBrandColor(c.hex), setColorText(""))}
                    className={`grid size-11 place-items-center rounded-pill border ${brandColor === c.hex ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""} ${c.hex === "#FFFFFF" || c.hex === "#F3E9D2" ? "border-line-strong" : "border-transparent"}`}
                    style={{ background: c.hex, color: checkBrandColor(c.hex).on }}
                  >
                    {brandColor === c.hex && <Check size={18} strokeWidth={3} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <Field id="s-color" label="Or type your colour" hint="A name like wine, navy or baby pink, or a code like #9C3B5C.">
                <div className="flex items-center gap-2">
                  <span className="size-13 shrink-0 rounded-md border border-line-strong" style={{ background: brandColor }} aria-hidden="true" />
                  <input
                    id="s-color"
                    className="input h-13 text-[17px]"
                    value={colorText}
                    onChange={(e) => {
                      setColorText(e.target.value);
                      const c = parseColor(e.target.value);
                      if (c) setBrandColor(c);
                    }}
                    placeholder="e.g. wine or #9C3B5C"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </Field>
              {colorText.trim() && !parseColor(colorText) ? (
                <p className="text-caption text-ink-muted">We don&apos;t know that colour yet. Try a name like navy, or a code like #1F3A93.</p>
              ) : (
                <p className="text-caption text-ink-muted">
                  {(() => {
                    // The swatch's name, or the words they typed ("Rose gold"), then the code.
                    const typed = colorText.trim() && !/^#?[0-9a-f]{3,6}$/i.test(colorText.trim()) ? colorText.trim().replace(/^./, (c) => c.toUpperCase()) : null;
                    const label = colorName(brandColor) ?? typed;
                    return (
                      <>
                        Picked: <b>{label ?? brandColor}</b>
                        {label ? ` · ${brandColor}` : ""}
                      </>
                    );
                  })()}
                </p>
              )}
              {!checkBrandColor(brandColor).ok && (
                <Note icon={Palette}>
                  Words on this colour may be hard to read.{" "}
                  <button type="button" className="font-semibold underline underline-offset-4" onClick={() => (setBrandColor(checkBrandColor(brandColor).suggestion ?? brandColor), setColorText(""))}>
                    Use a slightly darker shade
                  </button>
                </Note>
              )}
            </div>
            <Field id="s-tag" label="A short line about you (optional)" hint="Shown under your name, like “Bridal makeup that lasts all night”.">
              <input id="s-tag" className="input h-13 text-[17px]" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={60} placeholder="e.g. Neat braids, done on time" />
            </Field>
          </>
        )}

        {step === "where" && (
          <>
            <Title title="Where are you?" lead="Customers see this on your page." />
            <Field id="s-state" label="State">
              <select
                id="s-state"
                className="input h-13 text-[17px]"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setCity(citiesFor(e.target.value)[0] ?? "");
                  setTravelFee(travelFeeFor(e.target.value));
                }}
              >
                {STATE_NAMES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field id="s-city" label="City or town">
              <select id="s-city" className="input h-13 text-[17px]" value={city} onChange={(e) => setCity(e.target.value)}>
                {citiesFor(state).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field id="s-area" label="Area" hint="The part of town people know, like Bodija or Lekki Phase 1.">
              <input id="s-area" className="input h-13 text-[17px]" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Bodija" maxLength={40} />
            </Field>
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
                    {TRAVEL_REACHES.map((r) => (
                      <Chip key={r} on={reach === r} onClick={() => setReach(r)}>
                        {reachLabel(r, { area, city, state })}
                      </Chip>
                    ))}
                  </div>
                </div>
                <Field id="s-fee" label="Travel fee" hint={reach === "nigeria" ? `Typical in ${city}. ${farTripHint(state)}` : `Typical in ${city}. Customers see it before they pay.`}>
                  <Naira id="s-fee" value={travelFee} onChange={setTravelFee} />
                </Field>
              </div>
            )}
          </>
        )}

        {step === "services" && (
          <>
            <Title title="Your services" lead={`Typical prices in ${city}. Tick what you do, then tap Edit to change the price or how long it takes.`} />
            <ServicesEditor services={services} onChange={setServices} city={city} />
            <div>
              <h2 className="text-title">Extras customers can add</h2>
              <p className="text-caption mt-1 mb-2.5 text-ink-muted">They tick these when they book. Leave them off if you don&apos;t want any.</p>
              <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
                {extras.map((x, i) => (
                  <div key={x.name} className="flex items-center gap-3 px-4 py-3">
                    <Tick on={x.on} label={`Offer ${x.name}`} onClick={() => setExtras(extras.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
                    <span className="min-w-0 flex-1 text-[15px]">{x.name}</span>
                    <div className="w-30 shrink-0">
                      <Naira id={`s-x-${i}`} small plus value={x.price} onChange={(v) => setExtras(extras.map((y, j) => (j === i ? { ...y, price: v } : y)))} label={`Price for ${x.name}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === "photos" && (
          <>
            <Title title="Add your work" lead="At least 3 photos. Your best work first: this is what makes people book." />
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- demo media from memory
                <img key={p.id} src={p.thumbUrl} alt={`Your photo ${i + 1}`} className="aspect-square w-full rounded-md object-cover" />
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div key={`up-${i}`} className="grid aspect-square place-items-center rounded-md bg-surface-sunken">
                  <Loader2 className="animate-spin text-ink-muted" aria-label="Uploading" />
                </div>
              ))}
              <label className="relative grid aspect-square cursor-pointer place-items-center content-center gap-1 rounded-md border-2 border-dashed border-line-strong text-sm font-semibold">
                <ImagePlus size={24} aria-hidden="true" />
                Add photos
                <input type="file" accept="image/*" multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            </div>
            <p className="text-caption text-ink-muted">{photos.length < MIN_PHOTOS ? `${MIN_PHOTOS - photos.length} more to go.` : `${photos.length} photos. You can add more later.`}</p>
            {!real && (
              <button type="button" className="text-label justify-self-start text-brand underline underline-offset-4" onClick={() => go("hours")}>
                Skip for now (demo)
              </button>
            )}
          </>
        )}

        {step === "hours" && (
          <>
            <Title title="When do you work?" lead="Customers can only book inside these times." />
            <div className="grid gap-2">
              {(
                [
                  ["weekdays", "Monday to Friday"],
                  ["saturday", "Saturday"],
                  ["sunday", "Sunday"],
                ] as const
              ).map(([k, l]) => {
                const d = hours[k];
                const set = (patch: Partial<typeof d>) => setHours({ ...hours, [k]: { ...d, ...patch } });
                return (
                  <div key={k} className="grid gap-2 rounded-md border border-line bg-surface-raised px-4 py-3">
                    <button type="button" className="flex min-h-9 items-center justify-between text-left" aria-pressed={d.open} onClick={() => set({ open: !d.open })}>
                      <b>{l}</b>
                      <span className="flex items-center gap-3">
                        <span className="text-caption text-ink-muted">{d.open ? "Open" : "Closed"}</span>
                        <Switch on={d.open} />
                      </span>
                    </button>
                    {d.open && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="time" aria-label={`${l} opens`} className="input" value={d.from} onChange={(e) => set({ from: e.target.value })} />
                        <input type="time" aria-label={`${l} closes`} className="input" value={d.to} onChange={(e) => set({ to: e.target.value })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2 rounded-card border border-line bg-surface-raised p-4 text-center">
              <h2 className="text-title">How many customers can you do at the same time?</h2>
              <div className="flex flex-wrap justify-center gap-1.5 text-brand" aria-hidden="true">
                {Array.from({ length: capacity }, (_, i) => (
                  <ArmchairIcon key={i} size={28} />
                ))}
              </div>
              <div className="flex items-center justify-center gap-5 py-2">
                <button type="button" className="grid size-14 place-items-center rounded-pill border border-line-strong bg-surface text-2xl" aria-label="Fewer" onClick={() => setCapacity(Math.max(1, capacity - 1))}>
                  −
                </button>
                <span className="w-14 text-[44px] leading-none font-extrabold" aria-live="polite">
                  {capacity}
                </span>
                <button type="button" className="grid size-14 place-items-center rounded-pill border border-line-strong bg-surface text-2xl" aria-label="More" onClick={() => setCapacity(Math.min(8, capacity + 1))}>
                  +
                </button>
              </div>
              <p className="text-caption text-ink-muted">{capacity === 1 ? "Just you, one customer at a time." : `${capacity} customers can book the same time.`}</p>
            </div>
          </>
        )}

        {step === "live" && (
          <>
            <div className="grid justify-items-center gap-3 pt-2 text-center">
              <span className="grid size-18 place-items-center rounded-pill bg-success-soft text-success">
                <Check size={36} aria-hidden="true" />
              </span>
              <h1 className="text-heading">Your page is live!</h1>
              <p className="text-body-lg text-ink-muted">Customers can see your work and book a time.</p>
            </div>
            <div className="flex items-center gap-2 rounded-pill border border-line bg-surface-raised py-1.5 pr-1.5 pl-4">
              <span className="text-code min-w-0 flex-1 truncate">usetikka.com/{slug}</span>
              <button type="button" className="btn min-h-10 rounded-pill" onClick={() => navigator.clipboard?.writeText(`https://usetikka.com/${slug}`).catch(() => undefined)}>
                Copy
              </button>
            </div>
            <Link href={`/${slug}`} target="_blank" className="btn btn-secondary btn-lg w-full rounded-pill">
              <ExternalLink aria-hidden="true" /> See your page
            </Link>
            {real ? (
              <Note icon={ShieldCheck}>
                <b>Next: your booking rules.</b> Customers see them before they book. Deposits come after, once we&apos;ve checked your ID.
              </Note>
            ) : (
              <Note tone="gold" icon={ShieldCheck}>
                <b>One more step: stop no-shows.</b> Customers pay a small deposit when they book. If they don&apos;t come, you keep it.
              </Note>
            )}
          </>
        )}

        {step === "id" && (
          <>
            <Title title="Take deposits" lead="Money goes straight to your bank. Tikka never holds it. First, your ID, so we know it's really you." />
            <Field id="s-idt" label="Type of ID">
              <select id="s-idt" className="input h-13 text-[17px]" value={idType} onChange={(e) => setIdType(e.target.value)}>
                {ID_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field id="s-idn" label="Your name, as it is on the ID">
              <input id="s-idn" className="input h-13 text-[17px]" value={idName} onChange={(e) => setIdName(e.target.value)} placeholder="e.g. Adaeze Okoro" autoComplete="name" />
            </Field>
            <div>
              <span className="text-label mb-1.5 block">Photo of the ID</span>
              <Choice on={idPhoto} onClick={() => setIdPhoto(true)} icon={idPhoto ? Check : Camera} title={idPhoto ? "Photo added" : "Take a photo"} body={idPhoto ? "Tap to change it" : "All four corners, clear and bright"} />
            </div>
            <div>
              <span className="text-label mb-1.5 block">Is your business registered with CAC?</span>
              <div className="flex gap-2">
                <Chip on={registered === "no"} onClick={() => setRegistered("no")}>
                  Not yet
                </Chip>
                <Chip on={registered === "yes"} onClick={() => setRegistered("yes")}>
                  Yes
                </Chip>
              </div>
              <p className="text-caption mt-1.5 text-ink-muted">Not registered is fine. You can still take deposits.</p>
            </div>
            <Demo>Demo: nothing is uploaded or checked. Please don&apos;t type real ID details.</Demo>
          </>
        )}

        {step === "bank" && (
          <>
            <Title title="Where should we send your money?" lead="Deposits land here, usually the next working day." />
            <Field id="s-bank" label="Bank">
              <select
                id="s-bank"
                className="input h-13 text-[17px]"
                value={bank}
                onChange={(e) => {
                  setBank(e.target.value);
                  setAccountOk(false);
                }}
              >
                <option value="">Choose your bank</option>
                {BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field id="s-acct" label="Account number">
              <input
                id="s-acct"
                className="input text-code h-13 text-[17px]"
                inputMode="numeric"
                maxLength={10}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setAccountOk(false);
                }}
                placeholder="10 digits"
              />
            </Field>
            {bank && account.length === 10 && (
              accountOk ? (
                <Note tone="success" icon={CircleCheck}>
                  <b>{(idName || "Adaeze Okoro").toUpperCase()}</b>
                  <br />
                  Confirmed. Deposits go to this account.
                </Note>
              ) : (
                <div className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
                  <div>
                    <span className="text-caption text-ink-muted">Name from your bank</span>
                    <div className="text-title">{(idName || "Adaeze Okoro").toUpperCase()}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" className="btn rounded-pill" onClick={() => setAccountOk(true)}>
                      Yes, that&apos;s me
                    </button>
                    <button type="button" className="btn btn-secondary rounded-pill" onClick={() => setAccount("")}>
                      No
                    </button>
                  </div>
                </div>
              )
            )}
            <Demo>Demo: any 10 digits work and nothing is checked. Please don&apos;t type a real account number.</Demo>
          </>
        )}

        {step === "deposit" && (
          <>
            <Title title="How much deposit?" lead={`Most ${noun} businesses ask for ${SUGGESTED_DEPOSIT_PERCENT}%. You can change it any time.`} />
            <div className="flex flex-wrap gap-2">
              {[20, 30, 40, 50].map((p) => (
                <Chip key={p} on={depositMode === "percent" && depositPercent === p} onClick={() => { setDepositMode("percent"); setDepositPercent(p); }}>
                  {p}%
                  {p === SUGGESTED_DEPOSIT_PERCENT && <span className="ml-1 text-xs font-normal opacity-80">suggested</span>}
                </Chip>
              ))}
              <Chip on={depositMode === "fixed"} onClick={() => setDepositMode("fixed")}>
                Fixed amount
              </Chip>
            </div>
            {depositMode === "percent" ? (
              <Field id="s-dp" label="Or type your own">
                <PercentInput id="s-dp" value={depositPercent} onChange={setDepositPercent} label="Deposit percentage" />
                {depositPercent < MIN_DEPOSIT_PERCENT && <p className="text-caption mt-1.5 text-ink-muted">At least {MIN_DEPOSIT_PERCENT}%.</p>}
              </Field>
            ) : (
              <Field id="s-df" label="Deposit for every booking">
                <Naira id="s-df" value={depositFixed} onChange={setDepositFixed} />
              </Field>
            )}
            <div className="grid gap-1.5 rounded-card border border-line bg-surface-raised p-4">
              <span className="text-caption text-ink-muted">What your customer sees</span>
              <b className="text-[17px]">
                {sampleSvc?.item.name ?? "A booking"}
                {sampleSvc?.item.options ? `, ${sampleSvc.item.options[sampleSvc.item.options.length - 1].label.toLowerCase()}` : ""} · {naira(samplePrice)}
              </b>
              <div className="flex justify-between">
                <span>Deposit now</span>
                <b className="text-code">{naira(sampleDeposit)}</b>
              </div>
              <div className="flex justify-between">
                <span>Pay at the appointment</span>
                <b className="text-code">{naira(counts ? samplePrice - sampleDeposit : samplePrice)}</b>
              </div>
            </div>
            <button type="button" aria-pressed={counts} onClick={() => setCounts(!counts)} className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-line bg-surface-raised px-4 text-left">
              <span>
                <b className="block">The deposit counts towards the bill</b>
                <span className="text-caption text-ink-muted">{counts ? "They pay the rest on the day." : "They pay the full price on the day."}</span>
              </span>
              <Switch on={counts} />
            </button>
            {services.some((s) => s.on && s.item.eventDay) && (
              <Note icon={Clock}>Event days (weddings, shoots) take {EVENT_DEPOSIT_PERCENT}% to hold the date.</Note>
            )}
          </>
        )}

        {step === "rules" && rules && (
          <>
            <Title title="Your booking rules" lead="Customers see these before they pay. We wrote the usual ones. Tap any line to change it." />
            <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
              {rules.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-3 focus-within:outline-2 focus-within:outline-brand">
                  <CircleCheck size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  <textarea
                    aria-label={`Rule ${i + 1}`}
                    className="min-h-11 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-[22px] outline-none [field-sizing:content]"
                    value={r}
                    onChange={(e) => setRules(rules.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button type="button" aria-label={`Remove rule ${i + 1}`} className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center text-ink-muted" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary rounded-pill justify-self-start" onClick={() => setRules([...rules, ""])}>
              <Plus aria-hidden="true" /> Add a rule
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <div className="grid justify-items-center gap-3 pt-6 text-center">
              <span className="grid size-18 place-items-center rounded-pill bg-success-soft text-success">
                <PartyPopper size={34} aria-hidden="true" />
              </span>
              <h1 className="text-heading">You&apos;re all set, {firstName}!</h1>
              <p className="text-body-lg text-ink-muted">{real ? "Customers can see your work and book you." : "Customers can book you and pay a deposit."}</p>
            </div>
            <ul className="grid gap-0.5 rounded-card border border-line bg-surface-raised px-4 py-2">
              {[
                "Your page is live",
                `${services.filter((s) => s.on).length} services with prices`,
                `${photos.length} photos of your work`,
                "Your working hours",
                ...(real
                  ? []
                  : ["ID sent: we check it the same day", `Deposits: ${depositMode === "fixed" ? naira(depositFixed) : `${depositPercent}%`} to ${bank || "your bank"}`]),
                "Your booking rules",
              ].map((t) => (
                <li key={t} className="flex min-h-12 items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-pill bg-success text-on-success">
                    <Check size={16} aria-hidden="true" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            {real ? (
              <>
                <Note tone="gold" icon={ShieldCheck}>
                  <b>Stop no-shows with deposits.</b> Add your ID and bank account. We check your ID the same day, then customers pay a deposit when they book.
                </Note>
                <Link href="/app/settings/get-paid" className="btn btn-lg w-full rounded-pill">
                  Take deposits <ArrowRight aria-hidden="true" />
                </Link>
                <Link href="/app" className="btn btn-secondary btn-lg w-full rounded-pill">
                  Go to my dashboard
                </Link>
              </>
            ) : (
              <>
                <Note icon={Clock}>Until we&apos;ve checked your ID, customers can still book. Deposits switch on once it&apos;s checked.</Note>
                <Link href="/app" className="btn btn-lg w-full rounded-pill">
                  Go to my dashboard <ArrowRight aria-hidden="true" />
                </Link>
              </>
            )}
            <Link href={`/${slug}`} target="_blank" className="btn btn-secondary btn-lg w-full rounded-pill">
              <ExternalLink aria-hidden="true" /> See my page
            </Link>
          </>
        )}

        {problem && (
          <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
            {problem}
          </p>
        )}
      </main>

      {step !== "done" && (
        <div className="sticky bottom-0 z-10 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button type="button" className="btn btn-lg w-full rounded-pill" disabled={!ready[step] || pending} onClick={next}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {label[step] ?? "Next"} {!pending && <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      )}
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

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-label mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption mt-1.5 text-ink-muted">{hint}</p>}
    </div>
  );
}

function Naira({ id, value, onChange, small, plus, label }: { id: string; value: number; onChange: (v: number) => void; small?: boolean; plus?: boolean; label?: string }) {
  return (
    <div className={`flex items-center rounded-md border border-line-strong bg-surface-raised focus-within:outline-2 focus-within:outline-brand ${small ? "h-11 pl-2.5" : "h-13 pl-4"}`}>
      <span className="text-ink-muted">{plus ? "+₦" : "₦"}</span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        className={`h-full min-w-0 flex-1 bg-transparent pr-2 pl-1 outline-none ${small ? "text-base" : "text-[17px]"}`}
        value={value ? value.toLocaleString("en-NG") : ""}
        onChange={(e) => onChange(digits(e.target.value))}
      />
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}>
      {children}
    </button>
  );
}

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised text-transparent"}`}>
      <Check size={16} aria-hidden="true" />
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-7 w-11.5 shrink-0 rounded-pill transition-colors ${on ? "bg-brand" : "bg-line-strong"}`} aria-hidden="true">
      <span className={`absolute top-0.75 left-0.75 size-5.5 rounded-pill bg-surface-raised transition-transform ${on ? "translate-x-4.5" : ""}`} />
    </span>
  );
}

function Note({ tone, icon: Icon, children }: { tone?: "gold" | "success"; icon: LucideIcon; children: React.ReactNode }) {
  const bg = tone === "gold" ? "bg-gold-soft" : tone === "success" ? "bg-success-soft" : "bg-brand-soft";
  const fg = tone === "gold" ? "text-gold-text" : tone === "success" ? "text-success" : "text-brand";
  return (
    <div className={`flex gap-3 rounded-md px-4 py-3.5 ${bg}`}>
      <Icon size={22} className={`shrink-0 ${fg}`} aria-hidden="true" />
      <div className="text-body">{children}</div>
    </div>
  );
}

function Demo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-center text-ink-muted">{children}</p>
  );
}
