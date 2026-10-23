"use client";

import { Check, Copy, Send } from "lucide-react";
import { useActionState, useState, useSyncExternalStore } from "react";
import { inviteStaffAction, removeStaffAction, type InviteState } from "@/app/app/actions";

const noop = () => () => {};

/** Invite by email. DEMO: the email goes out in M1; until then, the link to share is shown. */
export function InviteStaffForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteStaffAction, undefined);
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const link = state?.link ? `${origin}${state.link}` : "";

  return (
    <div className="grid grid-cols-1 gap-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <label htmlFor="invite-email" className="sr-only">
          Staff email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="their@email.com"
          className="input min-w-0 sm:flex-1"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "invite-error" : undefined}
          required
        />
        <button type="submit" className="btn shrink-0" disabled={pending}>
          <Send />
          {pending ? "Sending…" : "Send invite"}
        </button>
      </form>
      {state?.error && (
        <p id="invite-error" role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div className="rounded-md bg-success-soft p-3" role="status">
          <p className="text-label text-ink">Invite ready for {state.email}. It works for 7 days.</p>
          <p className="text-caption mt-0.5 text-ink-muted">Send them this link on WhatsApp. (Tikka emails it too once email is set up.)</p>
          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-raised py-1 pl-3 pr-1">
            <span className="text-code min-w-0 flex-1 truncate font-mono font-normal">{link.replace(/^https?:\/\//, "")}</span>
            <button
              type="button"
              className="btn btn-secondary min-h-10 shrink-0 px-3 text-label"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {}
              }}
            >
              {copied ? <Check /> : <Copy />}
              <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Two taps to remove someone: no accidental removals at a busy counter. */
export function RemoveStaffButton({ userId, name }: { userId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-label min-h-11 rounded-md px-2 text-danger">
        Remove
      </button>
    );
  }
  return (
    <form action={removeStaffAction} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="text-label min-h-11 rounded-md bg-danger px-3 text-on-danger">
        Remove {name}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-label min-h-11 rounded-md px-2 text-ink-muted">
        Keep
      </button>
    </form>
  );
}
