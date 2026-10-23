"use client";

import { Camera, CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { checkCodeAction, confirmRedemptionAction } from "@/app/app/actions";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { clockTime, shortDate } from "@/lib/format";
import { offlineCheck, type CheckResult } from "@/lib/redeem";

// The counter screen (PRD B7): scan or type → check (never uses the code) → confirm.
// Never shows a phone number: check_code doesn't return one.

type Problem = Exclude<CheckResult, { kind: "valid" }> | { kind: "no_access"; code?: string };
type View =
  | { kind: "scan" }
  | { kind: "checking"; code: string }
  | { kind: "valid"; result: Extract<CheckResult, { kind: "valid" }> }
  | { kind: "invalid"; problem: Problem }
  | { kind: "done"; name: string };

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

export function RedeemScreen({ businessName, prefix }: { businessName: string; prefix: string }) {
  const [view, setView] = useState<View>({ kind: "scan" });
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string>();
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied" | "none">("off");
  const [ticked, setTicked] = useState(false);
  const [bill, setBill] = useState("");
  const [customer, setCustomer] = useState<"new" | "returning">("new");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string>();

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
          setView({ kind: "valid", result: r });
          buzz(20);
        } else {
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

  async function confirm() {
    if (view.kind !== "valid") return;
    const r = view.result;
    if (r.action && !ticked) {
      setConfirmError("Tick the box once they've done it.");
      return;
    }
    setConfirming(true);
    setConfirmError(undefined);
    try {
      const naira = Number(bill.replace(/[^\d]/g, "")) || null;
      const res = await confirmRedemptionAction(r.code, naira, ticked, customer);
      if (res.ok) {
        buzz(30);
        setView({ kind: "done", name: res.name });
        backTimer.current = setTimeout(scanAgain, 3500);
      } else if (res.result.kind === "needs_action") {
        setConfirmError("Tick the box once they've done it.");
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
            <dt className="text-label text-ink-muted">Tier</dt>
            <dd>
              <RarityBadge tier={view.result.tier} />
            </dd>
            <dt className="text-label text-ink-muted">Expires</dt>
            <dd className="text-body">{shortDate(view.result.expiresAt)}</dd>
            <dt className="text-label text-ink-muted">Code</dt>
            <dd className="text-code font-mono">{view.result.code}</dd>
          </dl>

          {view.result.action && (
            <label className="mt-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 border-success bg-surface-raised px-3 py-2">
              <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="size-6 shrink-0 accent-success" />
              <span className="text-body font-semibold">They did it: {view.result.action}</span>
            </label>
          )}

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
              How much did they spend? (₦)
            </label>
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
                  const d = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
                  setBill(d ? Number(d).toLocaleString("en-NG") : "");
                }}
                placeholder="25,000"
                size={1}
                className="h-14 w-0 min-w-0 flex-1 bg-transparent px-2 text-[24px] font-bold tabular-nums outline-none"
              />
            </div>
            <p className="text-caption text-ink-muted">Optional. It shows you what each drop brought in.</p>
          </div>

          {confirmError && (
            <p role="alert" className="text-caption mt-3 font-semibold text-danger">
              {confirmError}
            </p>
          )}

          <div className="mt-5 grid gap-2">
            <button type="button" className="btn btn-lg w-full" onClick={confirm} disabled={confirming || (Boolean(view.result.action) && !ticked)}>
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
          <p className="text-body mt-1 opacity-90">Tikka will thank them on WhatsApp and ask how it went.</p>
          <button type="button" className="btn btn-secondary btn-lg mt-5 w-full" onClick={scanAgain}>
            <ScanLine />
            Scan the next code
          </button>
        </section>
      )}
    </div>
  );
}
