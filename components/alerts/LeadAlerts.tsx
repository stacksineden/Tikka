"use client";

import { BellRing, Check, Loader2, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { pushStateAction, removePushAction, savePushAction, testPushAction } from "@/app/push-actions";

// New lead alerts on the owner's phone (web push). Owners only; the server checks again.
// - Android (and desktop Chrome, Edge, Firefox): Turn on alerts → the phone asks Allow → done.
// - iPhone: Apple only allows notifications from a site added to the home screen (iOS 16.4+), so
//   until Tikka is opened from its home screen icon, the card shows the steps instead of a button.
// The Home card can be hidden on this phone (remembered on the phone only); Settings always has the switch.

type State =
  | "loading"
  /** iPhone, not opened from the home screen icon yet. */
  | "ios-install"
  | "unsupported"
  /** Notifications blocked for usetikka.com in this browser. */
  | "denied"
  | "off"
  | "on";

const HIDE_KEY = "tikka-lead-alerts-card";

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The VAPID public key, base64url → bytes, as pushManager.subscribe wants it. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function useLeadAlerts(vapidKey: string) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    let live = true;
    (async () => {
      if (isIOS() && !isStandalone()) return setState("ios-install");
      if (!supported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return live && setState("off");
        const { on } = await pushStateAction(sub.endpoint);
        if (live) setState(on ? "on" : "off");
      } catch {
        if (live) setState("off");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const json = sub.toJSON();
      const r = await savePushAction({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
      if (r.ok) setState("on");
      else setNote(r.reason === "not_owner" ? "Only the business owner can turn on lead alerts." : "That didn't go through. Try again.");
    } catch {
      setNote("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [vapidKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setNote("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const { sent } = await testPushAction();
      setNote(sent > 0 ? "Sent. It should show on this phone in a few seconds." : "Nothing was sent. Turn alerts off and on again.");
    } catch {
      setNote("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, note, turnOn, turnOff, test };
}

function IosSteps() {
  return (
    <ol className="text-body grid gap-2">
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand text-label text-on-brand">1</span>
        <span>
          Tap the Share button <Share size={16} className="inline align-[-2px]" aria-label="Share" /> in Chrome or Safari
        </span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand text-label text-on-brand">2</span>
        <span>
          Tap <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>
        </span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand text-label text-on-brand">3</span>
        <span>
          Open Tikka from the new icon and tap <span className="font-semibold">Turn on alerts</span>
        </span>
      </li>
    </ol>
  );
}

const denied = () => `Notifications are blocked for ${window.location.host} on this phone. Allow them in your browser's site settings, then come back here.`;
const UNSUPPORTED = "This browser can't show notifications. On Android, use Chrome. On an iPhone, add Tikka to your home screen first.";

/** The dashboard Home card. Hidden once alerts are on, or when the owner hides it on this phone. */
export function LeadAlertsCard({ vapidKey }: { vapidKey: string }) {
  const { state, busy, note, turnOn } = useLeadAlerts(vapidKey);
  // Hidden on this phone? Read once; the server render shows nothing either way (state starts "loading").
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [justOn, setJustOn] = useState(false);

  if (hidden || state === "loading" || state === "unsupported" || (state === "on" && !justOn)) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };

  return (
    <aside aria-label="New lead alerts" className="relative grid gap-3 rounded-card bg-brand-soft p-4 pr-14 sm:p-6 sm:pr-16">
      <h2 className="text-title flex items-center gap-2 text-[17px] leading-6">
        <BellRing size={20} className="shrink-0 text-brand" aria-hidden="true" />
        Get told about every new lead
      </h2>
      {state === "on" ? (
        <p className="text-body flex items-center gap-2 font-semibold text-success" role="status">
          <Check size={18} aria-hidden="true" />
          Alerts are on for this phone.
        </p>
      ) : state === "ios-install" ? (
        <>
          <p className="text-body">On an iPhone, add Tikka to your home screen first. It takes a minute.</p>
          <IosSteps />
          <p className="text-caption text-ink-muted">Apple only allows notifications from apps on the home screen (iOS 16.4 or newer). No Add to Home Screen in Chrome? Do these steps once in Safari.</p>
        </>
      ) : state === "denied" ? (
        <p className="text-body">{denied()}</p>
      ) : (
        <>
          <p className="text-body">We&apos;ll send a notification to this phone the moment someone claims your Tikka, even when Tikka is closed.</p>
          <button
            type="button"
            className="btn min-h-12 w-full sm:w-auto sm:justify-self-start"
            disabled={busy}
            onClick={async () => {
              setJustOn(true);
              await turnOn();
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Turn on alerts
          </button>
        </>
      )}
      {note && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {note}
        </p>
      )}
      <button type="button" onClick={hide} className="absolute right-2 top-2 grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken" aria-label="Hide this">
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}

/** Settings → Account: the switch for this phone, and a test notification. */
export function LeadAlertsSetting({ vapidKey }: { vapidKey: string }) {
  const { state, busy, note, turnOn, turnOff, test } = useLeadAlerts(vapidKey);
  const on = state === "on";
  const canSwitch = state === "on" || state === "off";
  return (
    <section aria-labelledby="lead-alerts-h" className="grid gap-3 rounded-card border border-line bg-surface-raised p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid flex-1 gap-1">
          <h2 id="lead-alerts-h" className="text-title text-[17px] leading-6">
            New lead notifications on this phone
          </h2>
          <p className="text-body text-ink-muted">A notification each time someone claims your Tikka. Only owners get these; staff never do.</p>
        </div>
        {canSwitch && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="lead-alerts-h"
            disabled={busy}
            onClick={() => (on ? turnOff() : turnOn())}
            className={`relative mt-1 h-8 w-13 shrink-0 rounded-pill transition-colors ${on ? "bg-brand" : "bg-line-strong"} disabled:opacity-40`}
          >
            <span className={`absolute top-1 size-6 rounded-pill bg-surface-raised transition-transform ${on ? "translate-x-6" : "translate-x-1"} left-0`} />
          </button>
        )}
      </div>
      {state === "loading" && <p className="text-caption text-ink-muted">Checking this phone…</p>}
      {state === "on" && (
        <>
          <p className="text-label flex items-center gap-2 text-success" role="status">
            <Check size={18} aria-hidden="true" />
            On for this phone
          </p>
          <button type="button" className="btn btn-secondary min-h-11 w-full sm:w-auto sm:justify-self-start" disabled={busy} onClick={test}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Send a test notification
          </button>
        </>
      )}
      {state === "ios-install" && <IosSteps />}
      {state === "denied" && <p className="text-body">{denied()}</p>}
      {state === "unsupported" && <p className="text-body">{UNSUPPORTED}</p>}
      {note && (
        <p role={note.startsWith("Sent") ? "status" : "alert"} className={`text-caption font-semibold ${note.startsWith("Sent") ? "text-success" : "text-danger"}`}>
          {note}
        </p>
      )}
      <p className="text-caption text-ink-muted">Each phone or tablet you sign in on is switched on separately.</p>
    </section>
  );
}
