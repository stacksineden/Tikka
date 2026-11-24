"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

/** What an admin save answers: a reason it didn't save, or when it saved (so each save shows again). */
export type AdminFormState = { error?: string; savedAt?: number } | undefined;

/**
 * A form whose Save button shows it's working: "Saving…" (and can't be pressed again) while the server
 * action runs, then "Saved ✓" for a moment, or the reason it didn't save under the fields.
 */
export function ActionForm({
  action,
  className,
  buttonClassName = "btn btn-secondary min-h-11 px-4 text-label",
  label = "Save",
  children,
}: {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  className?: string;
  buttonClassName?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // "Saved" shows for the latest save until its moment is up.
  const [shownUntil, setDone] = useState<number | undefined>();
  const savedAt = state?.savedAt;
  const saved = savedAt !== undefined && savedAt !== shownUntil;
  useEffect(() => {
    if (savedAt === undefined) return;
    const t = setTimeout(() => setDone(savedAt), 1800);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <form action={formAction} className={className}>
      {children}
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClassName} gap-1`}>
        {pending ? (
          "Saving…"
        ) : saved ? (
          <>
            <Check size={16} aria-hidden="true" />
            Saved
          </>
        ) : (
          label
        )}
      </button>
      <p role="status" aria-live="polite" className="col-span-full text-caption text-danger empty:hidden">
        {!pending && state?.error ? state.error : ""}
      </p>
    </form>
  );
}
