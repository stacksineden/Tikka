"use client";

import { Check, Loader2, Search, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { adminForgetPersonAction, adminLookupPersonAction, type PersonLookupState } from "@/app/app/actions";
import { shortDate } from "@/lib/format";

/** What was removed, in this order: [one, many]. */
const LABEL: [string, string, string][] = [
  ["claims", "Tikka", "Tikkas"],
  ["reviews", "review", "reviews"],
  ["leads", "place on a customer list", "places on customer lists"],
  ["notify", "Notify me sign-up", "Notify me sign-ups"],
  ["opt_outs", "STOP record", "STOP records"],
  ["messages", "WhatsApp message", "WhatsApp messages"],
  ["claim_attempts", "claim attempt", "claim attempts"],
  ["feed_names", "name in a live feed", "names in live feeds"],
];

/**
 * Privacy requests (the privacy policy's "Your rights"): find what Tikka holds for a WhatsApp
 * number, then delete it once the person has asked. The number is posted, never put in the address.
 */
export function PrivacyRequests() {
  const [found, lookup, looking] = useActionState<PersonLookupState, FormData>(adminLookupPersonAction, { step: "idle" });
  const [done, forget, forgetting] = useActionState<PersonLookupState, FormData>(adminForgetPersonAction, { step: "idle" });
  const [asked, setAsked] = useState(false);
  // The "deleted" note only for the number it was about (a later lookup shows that number instead).
  const deleted = done.step === "deleted" && found.step === "found" && done.phoneHint === `${found.phone.slice(0, 4)}•••${found.phone.slice(-4)}` ? done : null;

  return (
    <div className="grid gap-3">
      <form action={lookup} className="flex gap-2">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-line-strong/50 bg-surface-raised px-3">
          <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">WhatsApp number</span>
          <input
            name="phone"
            inputMode="tel"
            autoComplete="off"
            placeholder="WhatsApp number, e.g. 0803 123 4567"
            defaultValue={found.step === "error" ? found.input : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          />
        </label>
        <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label" disabled={looking}>
          {looking ? <Loader2 className="animate-spin" /> : null}
          Find
        </button>
      </form>

      {found.step === "error" && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {found.error}
        </p>
      )}

      {deleted ? (
        <div role="status" className="grid gap-2 rounded-card border border-line bg-surface-raised p-4">
          <p className="text-body flex items-start gap-2 font-semibold">
            <Check size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            Deleted everything for {deleted.phoneHint}.
          </p>
          <p className="text-caption text-ink-muted">
            Removed:{" "}
            {LABEL.filter(([k]) => (deleted.counts[k] ?? 0) > 0)
              .map(([k, one, many]) => `${deleted.counts[k]} ${deleted.counts[k] === 1 ? one : many}`)
              .join(", ") || "nothing was held"}
            . Let them know it&apos;s done.
          </p>
        </div>
      ) : found.step === "found" ? (
        <div className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
          {found.record.claims.length === 0 && found.record.notify.length === 0 && found.record.messages === 0 && !found.record.optedOut ? (
            <p className="text-body">Tikka holds nothing for this number.</p>
          ) : (
            <>
              <div className="grid gap-1">
                <h3 className="text-label">Tikkas</h3>
                {found.record.claims.length === 0 ? (
                  <p className="text-caption text-ink-muted">None.</p>
                ) : (
                  <ul className="text-caption grid gap-1">
                    {found.record.claims.map((c, i) => (
                      <li key={i}>
                        {c.firstName} · {c.businessName} · {c.kind === "drop" ? c.dropTitle : "next-visit Tikka"} · {c.reward} · {shortDate(c.claimedAt)}
                        {c.redeemedAt ? " · used" : ""}
                        {c.reviewed ? " · reviewed" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-caption text-ink-muted">
                On the customer list of: {found.record.businessesWithLead.join(", ") || "none"}. Notify me:{" "}
                {found.record.notify.map((n) => n.businessName).join(", ") || "none"}. {found.record.optedOut ? "Has replied STOP. " : ""}
                {found.record.messages} WhatsApp messages.
              </p>
              <form action={forget} className="grid gap-3 border-t border-line pt-3">
                <input type="hidden" name="phone" value={found.phone} />
                <p className="text-caption text-ink-muted">
                  Deleting removes all of this for good. Their Tikkas stop counting in the businesses&apos; numbers; the cards they held stay used.
                </p>
                <label className="text-body flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="asked" checked={asked} onChange={(e) => setAsked(e.target.checked)} className="size-5" />
                  This person asked us to delete their details
                </label>
                {done.step === "error" && (
                  <p role="alert" className="text-caption font-semibold text-danger">
                    {done.error}
                  </p>
                )}
                <button type="submit" className="btn min-h-11 justify-self-start bg-danger px-4 text-label text-on-danger" disabled={!asked || forgetting}>
                  {forgetting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete everything
                </button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
