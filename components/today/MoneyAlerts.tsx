"use client";

// NEW DIRECTION: turn the money alerts on for this phone, and send one now to see it. "Send it now"
// shows the real notification on this phone straight away (no waiting for 8pm or Sunday).

import { Bell, BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { previewMoneyAlert, saveMoneyPhoneAction } from "@/app/app/money-alert-actions";

type State = "checking" | "unsupported" | "off" | "on" | "blocked";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function MoneyAlerts({ vapidKey }: { vapidKey?: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return setState("unsupported");
      setState(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "blocked" : "off");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function turnOn() {
    setBusy("on");
    setNote("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const p = await Notification.requestPermission();
      if (p !== "granted") {
        setState(p === "denied" ? "blocked" : "off");
        return;
      }
      setState("on");
      // With the push keys set, this phone also gets the 8pm and Sunday alerts on schedule.
      if (vapidKey) {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) });
        await saveMoneyPhoneAction(sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } });
      }
    } catch {
      setNote("That didn't work on this browser. Try Chrome, or on iPhone add Tikka to your home screen first.");
    } finally {
      setBusy(null);
    }
  }

  async function sendNow(kind: "evening" | "weekly") {
    setBusy(kind);
    setNote("");
    try {
      const alert = await previewMoneyAlert(kind);
      if (!alert) return setNote("Nothing to send yet.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await reg.showNotification(alert.title, { body: alert.body, tag: `money-${kind}`, icon: "/brand/tikka-app-icon-192.png", data: { url: alert.url } });
      setNote("Sent. Check your notifications.");
    } catch {
      setNote("Couldn't show it on this browser.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
      {state === "on" ? (
        <>
          <p className="text-body flex items-center gap-2">
            <BellRing size={20} className="text-success" aria-hidden="true" /> Alerts are on for this phone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary rounded-pill" disabled={!!busy} onClick={() => sendNow("evening")}>
              {busy === "evening" && <Loader2 className="animate-spin" aria-hidden="true" />} Send the 8pm one now
            </button>
            <button type="button" className="btn btn-secondary rounded-pill" disabled={!!busy} onClick={() => sendNow("weekly")}>
              {busy === "weekly" && <Loader2 className="animate-spin" aria-hidden="true" />} Send Sunday&apos;s now
            </button>
          </div>
          {!vapidKey && <p className="text-caption text-ink-muted">Demo: &quot;Send now&quot; works on this phone. The 8pm and Sunday alerts go out on their own once the push keys are set (docs/LAUNCH.md).</p>}
        </>
      ) : state === "blocked" ? (
        <p className="text-body">Notifications are blocked for Tikka on this phone. Turn them on in your browser&apos;s site settings, then come back.</p>
      ) : state === "unsupported" ? (
        <p className="text-body">This browser can&apos;t show alerts. On iPhone, tap Share, then Add to Home Screen, and open Tikka from there.</p>
      ) : (
        <button type="button" className="btn btn-lg w-full rounded-pill" disabled={state === "checking" || !!busy} onClick={turnOn}>
          {busy === "on" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Bell aria-hidden="true" />} Turn on alerts on this phone
        </button>
      )}
      {note && (
        <p role="status" className="text-caption text-ink-muted">
          {note}
        </p>
      )}
    </div>
  );
}
