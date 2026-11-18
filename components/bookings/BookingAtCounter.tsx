"use client";

import { CalendarCheck, Check } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { checkBookingCodeAction, markBookingAction } from "@/app/app/bookings-actions";
import { leftToPay, lengthLabel, PROBLEM_TEXT, whenLabel } from "@/lib/bookings";
import { naira } from "@/lib/format";
import type { BookingCheck } from "@/lib/bookings-data";

const STATUS: Record<string, string> = { booked: "Booked", arrived: "Already marked as came in", no_show: "Marked as no-show", cancelled: "Cancelled" };

/**
 * A BK- booking ref typed on Redeem (docs/BOOKINGS.md journey 10): whose booking, for what and
 * when, then Arrived. Owners and staff; never the phone number. Checking changes nothing.
 */
export function BookingAtCounter({ code, onDone }: { code: string; onDone: () => void }) {
  const [r, setR] = useState<BookingCheck | null>(null);
  // When the check came back: Arrived shows from an hour before the time.
  const [checkedAt, setCheckedAt] = useState(0);
  const [error, setError] = useState("");
  const [marked, setMarked] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    checkBookingCodeAction(code)
      .then((x) => {
        if (!live) return;
        setCheckedAt(Date.now());
        setR(x);
      })
      .catch(() => live && setError("No connection. Check your data and try again."));
    return () => {
      live = false;
    };
  }, [code]);

  if (error) return <p role="alert" className="text-body rounded-card bg-danger-soft p-4 text-danger">{error}</p>;
  if (!r) return <p className="text-body text-ink-muted">Checking {code}…</p>;
  if (r.kind !== "booking") {
    return (
      <section className="rounded-card bg-danger-soft p-5 text-ink" role="status">
        <p className="text-title">{r.kind === "wrong_business" ? "That booking is for another business." : "No booking with that ref."}</p>
        <button type="button" className="btn btn-secondary mt-3 min-h-11" onClick={onDone}>
          Check another code
        </button>
      </section>
    );
  }
  return (
    <section className="rounded-card bg-success-soft p-5 text-ink" role="status" aria-labelledby="bk-h">
      <p className="text-label flex items-center gap-1.5">
        <CalendarCheck size={16} aria-hidden="true" />
        {marked ? "Came in" : STATUS[r.status]} · <span className="font-mono">{r.code}</span>
      </p>
      <h2 id="bk-h" className="text-heading mt-1">
        {r.firstName}
      </h2>
      <p className="text-body mt-1">
        {r.service} · {lengthLabel(r.minutes)}
      </p>
      <p className="text-body font-semibold">{whenLabel(r.startsAt)}</p>
      {r.depositPaidKobo ? (
        <p className="text-body-lg mt-2 font-semibold">
          Deposit paid {naira(r.depositPaidKobo / 100)} ·{" "}
          {(() => {
            const left = leftToPay(r, r.depositPaidKobo);
            return left === null ? "collect the rest you agreed" : left > 0 ? `collect ${naira(left / 100)}` : "nothing to collect";
          })()}
        </p>
      ) : null}
      {r.status === "booked" && !marked && new Date(r.startsAt).getTime() > checkedAt + 3_600_000 && (
        <p className="text-body mt-3 rounded-md bg-surface-raised px-3 py-2">Not today: they&apos;re booked for {whenLabel(r.startsAt)}.</p>
      )}
      {r.status === "booked" && !marked && new Date(r.startsAt).getTime() <= checkedAt + 3_600_000 && (
        <button
          type="button"
          className="btn mt-4 min-h-[52px] w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const x = await markBookingAction(r.id, "arrived");
              if (x.kind === "arrived") setMarked(true);
              else setError(PROBLEM_TEXT[x.kind] ?? "That didn't work. Try again.");
            })
          }
        >
          <Check size={18} aria-hidden="true" />
          {pending ? "Saving…" : "Arrived"}
        </button>
      )}
      <button type="button" className="btn btn-ghost mt-2 min-h-11 w-full" onClick={onDone}>
        {marked ? "Done" : "Check another code"}
      </button>
    </section>
  );
}
