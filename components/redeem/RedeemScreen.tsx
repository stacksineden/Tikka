"use client";

import { Camera, CheckCircle2, Loader2, ScanLine, Smartphone, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { checkCodeAction, checkDigitsAction, confirmRedemptionAction, giveMoreTimeAction } from "@/app/app/actions";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { visitWhen } from "@/lib/followups";
import { clockTime, naira, shortDate } from "@/lib/format";
import { MORE_TIME_DAYS, noMoreTimeReason } from "@/lib/more-time";
import { formatNairaInput, parseNaira } from "@/lib/spent";
import { SpentEdit } from "@/components/leads/SpentEdit";
import { offlineCheck, type CheckResult } from "@/lib/redeem";

// The counter screen (PRD B7): scan or type → check (never uses the code) → confirm.
// Never shows a phone number: check_code doesn't return one. A Tikka claimed by typing a number
// also needs the WhatsApp check: staff read the last 6 digits off the customer's WhatsApp, and
// Tikka only answers matches or not (3 wrong tries a day). A WhatsApp that already used a Tikka from
// the same drop (through another typed number) can't use a second one.

/** The WhatsApp check on a typed-in Tikka. */
type WaCheck =
  | { kind: "none" }
  | { kind: "open"; triesLeft: number; error?: string }
  | { kind: "closed" }
  /** The right WhatsApp, but it already used a Tikka from this drop. */
  | { kind: "repeat" }
  | { kind: "passed" };

type Problem = Exclude<CheckResult, { kind: "valid" }> | { kind: "no_access"; code?: string };
type View =
  | { kind: "scan" }
  | { kind: "checking"; code: string }
  | { kind: "valid"; result: Extract<CheckResult, { kind: "valid" }> }
  | { kind: "invalid"; problem: Problem }
  /** `code` and `skipped`: the owner can add what they spent right away if nobody typed it. */
  | { kind: "done"; name: string; askReview?: boolean; code: string; skipped: boolean };

type Scanner = { start(): Promise<void>; stop(): void; destroy(): void };

function buzz(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {}
}

/** "GS7X4QX" → "GS-7X4QX" as they type. */
function formatTyped(v: string): string {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return s.length > 2 ? `${s.slice(0, 2)}-${s.slice(2)}` : s;
}

function reason(p: Problem, businessName: string): string {
  const code = p.code ?? "That code";
  switch (p.kind) {
    case "already_used":
      return `${code} was already used on ${shortDate(p.at)} at ${clockTime(p.at)}.`;
    case "expired":
      return `${code} expired on ${shortDate(p.at)}.`;
    case "wrong_day":
      return `${code} can't be used today. ${p.days}.`;
    case "wrong_business":
      return `${code} is a Tikka from another business.`;
    case "typo":
      return `${code} has a typo. Check the code with the customer.`;
    case "unknown":
      return `${code} isn't a ${businessName} Tikka. Check the code with the customer.`;
    case "no_access":
      return `You can't redeem for ${businessName} any more. Ask the owner to invite you again.`;
  }
}

/** `isOwner`: only the owner can give an expired Tikka its one extra week ("Give more time"). */
export function RedeemScreen({ businessName, prefix, isOwner = false }: { businessName: string; prefix: string; isOwner?: boolean }) {
  const [view, setView] = useState<View>({ kind: "scan" });
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string>();
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied" | "none">("off");
  const [ticked, setTicked] = useState(false);
  const [bill, setBill] = useState("");
  const [customer, setCustomer] = useState<"new" | "returning">("new");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string>();
  const [wa, setWa] = useState<WaCheck>({ kind: "none" });
  const [digits, setDigits] = useState("");
  const [checkingDigits, setCheckingDigits] = useState(false);
  const [moreTime, setMoreTime] = useState<{ saving: boolean; error?: string }>({ saving: false });

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const busy = useRef(false);
  const backTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const check = useCallback(
    async (raw: string, typedIn = false) => {
      if (busy.current) return;
      const offline = offlineCheck(raw);
      if (!offline.ok && typedIn) {
        // Typed: say what's wrong right under the field, so they fix one character.
        setTypedError(
          offline.result.kind === "typo" ? "That code has a typo. Check it with the customer." : `Tikka codes look like ${prefix}-7X4QP.`,
        );
        return;
      }
      if (!offline.ok) {
        setView({ kind: "invalid", problem: offline.result as Problem });
        buzz([40, 60, 40]);
        return;
      }
      busy.current = true;
      scannerRef.current?.stop();
      setView({ kind: "checking", code: offline.code });
      try {
        const r = await checkCodeAction(offline.code);
        if (r.kind === "valid") {
          setTicked(false);
          setBill("");
          setCustomer(r.suggestedStatus);
          setConfirmError(undefined);
          setDigits("");
          setWa(
            !r.whatsappCheck
              ? { kind: "none" }
              : r.whatsappCheck.triesLeft > 0
                ? { kind: "open", triesLeft: r.whatsappCheck.triesLeft }
                : { kind: "closed" },
          );
          setView({ kind: "valid", result: r });
          buzz(20);
        } else {
          setMoreTime({ saving: false });
          setView({ kind: "invalid", problem: { ...r, code: offline.code } as Problem });
          buzz([40, 60, 40]);
        }
      } catch {
        setView({ kind: "scan" });
        setTypedError("No connection. Check your data and try again.");
      } finally {
        busy.current = false;
      }
    },
    [prefix],
  );

  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("none");
      return;
    }
    setCamera("starting");
    try {
      if (!scannerRef.current) {
        // Loaded only on this screen (TECH_PLAN §8). Uses the phone's own barcode detector where it has one.
        const { default: QrScanner } = await import("qr-scanner");
        if (!(await QrScanner.hasCamera())) {
          setCamera("none");
          return;
        }
        scannerRef.current = new QrScanner(video, (r) => check(r.data), {
          preferredCamera: "environment",
          maxScansPerSecond: 8,
          highlightScanRegion: false,
          returnDetailedScanResult: true,
        });
      }
      await scannerRef.current.start();
      setCamera("on");
    } catch {
      setCamera("denied");
    }
  }, [check]);

  // Open to the scanner (PRD B7). Stop the camera when leaving the screen.
  useEffect(() => {
    const t = setTimeout(startCamera, 0);
    return () => {
      clearTimeout(t);
      clearTimeout(backTimer.current);
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [startCamera]);

  function scanAgain() {
    clearTimeout(backTimer.current);
    setMoreTime({ saving: false });
    setTyped("");
    setTypedError(undefined);
    setView({ kind: "scan" });
    if (camera === "on" || camera === "starting") scannerRef.current?.start().catch(() => setCamera("denied"));
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    setTypedError(undefined);
    if (!typed.trim()) {
      setTypedError("Type the code from their Tikka.");
      return;
    }
    check(typed, true);
  }

  async function checkDigits(e: FormEvent) {
    e.preventDefault();
    if (view.kind !== "valid" || wa.kind !== "open" || checkingDigits) return;
    if (!/^\d{6}$/.test(digits)) {
      setWa({ ...wa, error: "Type the last 6 digits of the number on their WhatsApp." });
      return;
    }
    setCheckingDigits(true);
    try {
      const r = await checkDigitsAction(view.result.code, digits);
      switch (r.kind) {
        case "matched":
        case "not_needed":
          setWa({ kind: "passed" });
          setConfirmError(undefined);
          buzz(20);
          break;
        case "no_match":
          setDigits("");
          setWa({ kind: "open", triesLeft: r.triesLeft, error: `Doesn't match. ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} left today.` });
          buzz([40, 60, 40]);
          break;
        case "closed_today":
          setDigits("");
          setWa({ kind: "closed" });
          buzz([40, 60, 40]);
          break;
        case "used_by_this_whatsapp":
          setDigits("");
          setWa({ kind: "repeat" });
          buzz([40, 60, 40]);
          break;
        case "invalid_digits":
          setWa({ ...wa, error: "Type the last 6 digits of the number on their WhatsApp." });
          break;
        default:
          setView({ kind: "invalid", problem: { ...r, code: view.result.code } as Problem });
      }
    } catch {
      setWa({ ...wa, error: "No connection. Nothing was used. Try again." });
    } finally {
      setCheckingDigits(false);
    }
  }

  async function confirm() {
    if (view.kind !== "valid") return;
    const r = view.result;
    if (wa.kind === "open" || wa.kind === "closed" || wa.kind === "repeat") {
      setConfirmError(wa.kind === "repeat" ? "This WhatsApp has already used a Tikka from this drop." : "Check their WhatsApp first.");
      return;
    }
    if (r.action && !ticked) {
      setConfirmError("Tick the box once they've done it.");
      return;
    }
    setConfirming(true);
    setConfirmError(undefined);
    try {
      const spent = parseNaira(bill) || null;
      const res = await confirmRedemptionAction(r.code, spent, ticked, customer);
      if (res.ok) {
        buzz(30);
        setView({ kind: "done", name: res.name, askReview: res.askReview, code: r.code, skipped: !spent });
        // A page claim: give staff time to ask for the review before the screen moves on.
        // The owner who skipped the amount gets a moment to add it.
        backTimer.current = setTimeout(scanAgain, res.askReview || (isOwner && !spent) ? 8000 : 3500);
      } else if (res.result.kind === "needs_action") {
        setConfirmError("Tick the box once they've done it.");
      } else if (res.result.kind === "needs_whatsapp_check") {
        setWa({ kind: "open", triesLeft: 1 });
        setConfirmError("Check their WhatsApp first.");
      } else if (res.result.kind === "used_by_this_whatsapp") {
        setWa({ kind: "repeat" });
        setConfirmError(undefined);
      } else {
        setView({ kind: "invalid", problem: { ...res.result, code: r.code } as Problem });
      }
    } catch {
      setConfirmError("No connection. Nothing was used. Try again.");
    } finally {
      setConfirming(false);
    }
  }

  const scanning = view.kind === "scan" || view.kind === "checking";
  const waBlocks = wa.kind === "open" || wa.kind === "closed" || wa.kind === "repeat";

  return (
    <div className="mx-auto grid w-full max-w-md gap-4 px-4 pb-8 pt-4 sm:pt-8">
      <div>
        <h1 className="text-heading">Redeem</h1>
        <p className="text-body mt-1 text-ink-muted">Scan the QR on their Tikka, or type the code.</p>
      </div>

      {/* The camera stays mounted so it can resume instantly between customers. */}
      <div className={`stage relative aspect-square w-full overflow-hidden rounded-card bg-night ${scanning ? "" : "hidden"}`} data-theme="light">
        <video ref={videoRef} className="size-full object-cover" muted playsInline aria-label="Camera view for scanning a Tikka QR code" />
        {camera === "on" && (
          <div className="pointer-events-none absolute inset-[18%] rounded-card border-[3px] border-on-night/80" aria-hidden="true" />
        )}
        {camera !== "on" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-on-night">
            {camera === "starting" ? (
              <Loader2 className="size-8 animate-spin" aria-label="Starting the camera" />
            ) : (
              <div className="grid justify-items-center gap-3">
                <Camera size={32} aria-hidden="true" />
                <p className="text-body text-on-night-muted">
                  {camera === "denied"
                    ? "Tikka needs the camera to scan. Allow it in your browser, or type the code below."
                    : camera === "none"
                      ? "No camera here. Type the code below."
                      : "Turn on the camera to scan Tikka QR codes."}
                </p>
                {camera !== "none" && (
                  <button type="button" className="btn" onClick={startCamera}>
                    <ScanLine />
                    {camera === "denied" ? "Try the camera again" : "Turn on camera"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {view.kind === "checking" && (
          <div className="absolute inset-0 grid place-items-center bg-night/70 text-on-night" role="status">
            <span className="grid justify-items-center gap-2">
              <Loader2 className="size-8 animate-spin" aria-hidden="true" />
              <span className="text-label font-mono">Checking {view.code}…</span>
            </span>
          </div>
        )}
      </div>

      {scanning && (
        <form onSubmit={submitTyped} className="grid gap-2" noValidate>
          <label htmlFor="redeem-code" className="text-label">
            Type the code
          </label>
          <div className="flex gap-2">
            <input
              id="redeem-code"
              value={typed}
              onChange={(e) => {
                setTyped(formatTyped(e.target.value));
                setTypedError(undefined);
              }}
              placeholder={`${prefix}-7X4QP`}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              inputMode="text"
              maxLength={8}
              className="input min-w-0 flex-1 font-mono text-[18px] tracking-[0.12em]"
              aria-invalid={typedError ? true : undefined}
              aria-describedby={typedError ? "redeem-code-err" : undefined}
            />
            <button type="submit" className="btn shrink-0" disabled={view.kind === "checking"}>
              Check
            </button>
          </div>
          {typedError && (
            <p id="redeem-code-err" role="alert" className="text-caption font-semibold text-danger">
              {typedError}
            </p>
          )}
          <p className="text-caption text-ink-muted">Checking never uses the code. It&apos;s only used when you confirm.</p>
        </form>
      )}

      {view.kind === "valid" && (
        <section className="rounded-card bg-success-soft p-5 text-ink" role="status" aria-labelledby="valid-h">
          <h2 id="valid-h" className="text-title flex items-center gap-2 text-success">
            <CheckCircle2 size={24} aria-hidden="true" />
            Valid
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
            <dt className="text-label text-ink-muted">Name</dt>
            <dd className="text-title">{view.result.name}</dd>
            <dt className="text-label text-ink-muted">Reward</dt>
            <dd className="text-body-lg font-semibold">{view.result.reward}</dd>
            {view.result.terms && (
              <>
                <dt className="text-label text-ink-muted">Only if</dt>
                <dd className="text-body font-semibold">{view.result.terms}</dd>
              </>
            )}
            <dt className="text-label text-ink-muted">Tier</dt>
            <dd>
              <RarityBadge tier={view.result.tier} />
            </dd>
            <dt className="text-label text-ink-muted">Expires</dt>
            <dd className="text-body">{shortDate(view.result.expiresAt)}</dd>
            {view.result.plannedVisitDate && (
              <>
                <dt className="text-label text-ink-muted">Planned</dt>
                <dd className="text-body font-semibold">{capitalise(visitWhen(view.result.plannedVisitDate, view.result.plannedVisitPart, new Date()))}</dd>
              </>
            )}
            <dt className="text-label text-ink-muted">Code</dt>
            <dd className="text-code font-mono">{view.result.code}</dd>
          </dl>

          {wa.kind === "open" && (
            <form onSubmit={checkDigits} className="mt-4 grid gap-3 rounded-md border-2 border-brand bg-surface-raised p-4" noValidate aria-labelledby="wa-h">
              <h3 id="wa-h" className="text-title flex items-center gap-2 text-[17px] text-brand">
                <Smartphone size={20} aria-hidden="true" />
                Check their WhatsApp first
              </h3>
              <ol className="text-body grid list-decimal gap-1 pl-5">
                <li>Ask them to open WhatsApp, go to Settings and tap their name.</li>
                <li>Read the number on their profile yourself. Don&apos;t type what they tell you, and don&apos;t accept a screenshot.</li>
                <li>Type the last 6 digits.</li>
              </ol>
              <label htmlFor="wa-digits" className="text-label">
                Last 6 digits
              </label>
              <div className="flex gap-2">
                <input
                  id="wa-digits"
                  value={digits}
                  onChange={(e) => {
                    setDigits(e.target.value.replace(/\D/g, "").slice(0, 6));
                    if (wa.error) setWa({ kind: "open", triesLeft: wa.triesLeft });
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="go"
                  maxLength={6}
                  placeholder="••••••"
                  className="input w-0 min-w-0 flex-1 text-center font-mono text-[22px] tracking-[0.3em]"
                  aria-invalid={wa.error ? true : undefined}
                  aria-describedby="wa-help"
                />
                <button type="submit" className="btn shrink-0" disabled={checkingDigits}>
                  {checkingDigits ? <Loader2 className="animate-spin" /> : null}
                  Check
                </button>
              </div>
              <p id="wa-help" role={wa.error ? "alert" : undefined} className={`text-caption font-semibold ${wa.error ? "text-danger" : "text-ink-muted"}`}>
                {wa.error ?? `${wa.triesLeft} ${wa.triesLeft === 1 ? "try" : "tries"} left today. Nothing is used until you confirm.`}
              </p>
              <p className="text-caption text-ink-muted">No phone with them? Don&apos;t check. They can come back with it.</p>
            </form>
          )}

          {wa.kind === "closed" && (
            <div className="mt-4 grid gap-1 rounded-md bg-danger-soft p-4" role="alert">
              <p className="text-title flex items-center gap-2 text-[17px] text-danger">
                <XCircle size={20} aria-hidden="true" />
                Doesn&apos;t match. Don&apos;t give the reward.
              </p>
              <p className="text-body">Ask them to come back with the phone they claimed with. You can check again tomorrow. Nothing was used.</p>
            </div>
          )}

          {wa.kind === "repeat" && (
            <div className="mt-4 grid gap-1 rounded-md bg-danger-soft p-4" role="alert">
              <p className="text-title flex items-center gap-2 text-[17px] text-danger">
                <XCircle size={20} aria-hidden="true" />
                This WhatsApp has already used a Tikka from this drop.
              </p>
              <p className="text-body">Don&apos;t give the reward. One Tikka per person per drop. Nothing was used.</p>
            </div>
          )}

          {wa.kind === "passed" && (
            <p className="text-label mt-4 flex items-center gap-2 rounded-md bg-surface-raised px-3 py-3 text-success">
              <CheckCircle2 size={20} aria-hidden="true" />
              Their WhatsApp matches.
            </p>
          )}

          {view.result.action && (
            <label className="mt-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 border-success bg-surface-raised px-3 py-2">
              <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="size-6 shrink-0 accent-success" />
              <span className="text-body font-semibold">They did it: {view.result.action}</span>
            </label>
          )}

          {wa.kind !== "closed" && (
            <>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-pill bg-surface-raised p-1" role="radiogroup" aria-label="Customer">
              {(
                [
                  ["new", "New customer"],
                  ["returning", "Been here before"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={customer === v}
                  onClick={() => setCustomer(v)}
                  className={`text-label min-h-11 rounded-pill px-2 ${customer === v ? "bg-brand text-on-brand" : "text-ink-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-1.5">
              <label htmlFor="redeem-bill" className="text-title text-[17px]">
                What did they spend?
              </label>
              <p id="redeem-bill-help" className="text-body -mt-1 text-ink-muted">
                This adds to your drop&apos;s results.
              </p>
              <div className="flex items-center rounded-md border-2 border-line-strong bg-surface-raised focus-within:outline-2 focus-within:outline-brand">
                <span className="pl-4 text-[22px] font-bold text-ink-muted" aria-hidden="true">
                  ₦
                </span>
                <input
                  id="redeem-bill"
                  inputMode="numeric"
                  autoComplete="off"
                  value={bill}
                  onChange={(e) => {
                    setBill(formatNairaInput(e.target.value));
                  }}
                  placeholder="25,000"
                  aria-describedby="redeem-bill-help"
                  size={1}
                  className="h-14 w-0 min-w-0 flex-1 bg-transparent px-2 text-[24px] font-bold tabular-nums outline-none"
                />
              </div>
              <p className="text-caption text-ink-muted">Optional. Skip it if you don&apos;t know.</p>
            </div>
            </>
          )}

          {confirmError && (
            <p role="alert" className="text-caption mt-3 font-semibold text-danger">
              {confirmError}
            </p>
          )}

          <div className="mt-5 grid gap-2">
            <button type="button" className="btn btn-lg w-full" onClick={confirm} disabled={confirming || waBlocks || (Boolean(view.result.action) && !ticked)}>
              {confirming ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {confirming ? "Confirming…" : "Confirm redemption"}
            </button>
            <button type="button" className="text-label min-h-11 text-ink-muted" onClick={scanAgain}>
              Not now, scan another code
            </button>
          </div>
        </section>
      )}

      {view.kind === "invalid" && (
        <section className="rounded-card bg-danger p-5 text-on-danger" role="alert" aria-labelledby="invalid-h">
          <h2 id="invalid-h" className="text-title flex items-center gap-2">
            <XCircle size={24} aria-hidden="true" />
            Not valid
          </h2>
          <p className="text-body-lg mt-3">{reason(view.problem, businessName)}</p>
          {view.problem.kind === "already_used" && view.problem.name && (
            <p className="text-body mt-1 opacity-90">
              {view.problem.name}
              {view.problem.spentKobo ? ` · spent ${naira(view.problem.spentKobo / 100)}` : ""}
            </p>
          )}
          {view.problem.kind === "already_used" && view.problem.canSetSpent && view.problem.code && isOwner && (
            <SpentEdit
              key={`spent-${view.problem.code}`}
              variant="panel"
              target={{ code: view.problem.code }}
              name={view.problem.name ?? ""}
              spent={view.problem.spentKobo ? view.problem.spentKobo / 100 : undefined}
            />
          )}
          {view.problem.kind === "expired" && view.problem.name && (
            <p className="text-body mt-1 opacity-90">
              {view.problem.name}
              {view.problem.reward ? ` · ${view.problem.reward}` : ""}
            </p>
          )}
          {view.problem.kind === "expired" &&
            view.problem.moreTime &&
            (isOwner ? (
              <div className="mt-4 grid gap-2 rounded-md bg-surface-raised p-4 text-ink">
                <p className="text-body">
                  You can give it {MORE_TIME_DAYS} more days, until <span className="font-semibold">{shortDate(view.problem.moreTime)}</span>. Only once.
                </p>
                {moreTime.error && (
                  <p role="alert" className="text-caption font-semibold text-danger">
                    {moreTime.error}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-lg w-full"
                  disabled={moreTime.saving}
                  onClick={async () => {
                    const code = view.problem.code;
                    if (!code) return;
                    setMoreTime({ saving: true });
                    try {
                      const r = await giveMoreTimeAction({ code });
                      if (r.kind === "extended") {
                        setMoreTime({ saving: false });
                        setView({ kind: "scan" });
                        await check(code);
                      } else setMoreTime({ saving: false, error: noMoreTimeReason(r.kind) });
                    } catch {
                      setMoreTime({ saving: false, error: "No connection. Check your data and try again." });
                    }
                  }}
                >
                  {moreTime.saving ? "Saving…" : "Give more time"}
                </button>
              </div>
            ) : (
              <p className="text-body mt-4 rounded-md bg-surface-raised p-4 text-ink">
                Only the owner can give more time. Ask them to open Leads and find {view.problem.name ?? "this customer"}, then check the code again.
              </p>
            ))}
          {view.problem.kind === "expired" && view.problem.moreTime && !isOwner && view.problem.code && (
            <button type="button" className="btn btn-secondary btn-lg mt-3 w-full" onClick={() => check(view.problem.code!)}>
              Check again
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-lg mt-5 w-full" onClick={scanAgain}>
            <ScanLine />
            Scan another code
          </button>
        </section>
      )}

      {view.kind === "done" && (
        <section className="rounded-card bg-success p-6 text-center text-on-success" role="status">
          <CheckCircle2 size={44} className="mx-auto" aria-hidden="true" />
          <h2 className="text-title mt-3">Done. {view.name}&apos;s Tikka is used.</h2>
          <p className="text-body mt-1 opacity-90">
            {view.askReview
              ? "Ask them to rate you before they go. The stars are on their phone now."
              : "Tikka will thank them on WhatsApp and ask how it went."}
          </p>
          {isOwner && view.skipped && (
            <SpentEdit key={`spent-${view.code}`} variant="panel" target={{ code: view.code }} name={view.name} onOpen={() => clearTimeout(backTimer.current)} />
          )}
          <button type="button" className="btn btn-secondary btn-lg mt-5 w-full" onClick={scanAgain}>
            <ScanLine />
            Scan the next code
          </button>
        </section>
      )}
    </div>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
