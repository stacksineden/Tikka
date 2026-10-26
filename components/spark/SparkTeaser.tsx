"use client";

import { Check, Loader2, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { dismissSparkAction, joinSparkAction, joinSparkContactAction, type SparkContactState } from "@/app/spark-actions";
import { Spark } from "@/components/tikka/glyphs";

/** Spark's mark: the spark in the brand purple (never gold, CLAUDE.md) and a "Coming soon" badge. */
export function SparkMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
        <Spark className="size-5" />
      </span>
      <span className="text-caption rounded-pill border border-brand/40 px-2 py-0.5 font-semibold text-brand">Coming soon</span>
    </span>
  );
}

/** "Get early access" for a signed-in owner: one tap, then "You're on the list" (PRD B12). */
export function SparkJoin({ onList: initial, canJoin }: { onList: boolean; canJoin: boolean }) {
  const [onList, setOnList] = useState(initial);
  const [pending, start] = useTransition();
  if (onList) {
    return (
      <p className="text-label inline-flex min-h-11 items-center gap-1.5 text-success">
        <Check size={18} aria-hidden="true" />
        You&apos;re on the list
      </p>
    );
  }
  if (!canJoin) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary min-h-11 justify-self-start text-label"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if ((await joinSparkAction()).ok) setOnList(true);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      Get early access
    </button>
  );
}

/** A dashboard teaser (builder or drop dashboard): copy as given, dismissible per business. */
export function SparkCard({
  teaser,
  text,
  onList,
  canAct,
}: {
  teaser: "spark_builder" | "spark_dashboard";
  text: React.ReactNode;
  onList: boolean;
  canAct: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <aside aria-label="Spark, coming soon" className="relative grid gap-3 rounded-card border border-dashed border-brand/40 bg-surface-raised p-4 pr-14">
      <SparkMark />
      <p className="text-body">{text}</p>
      <SparkJoin onList={onList} canJoin={canAct} />
      {canAct && (
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            void dismissSparkAction(teaser);
          }}
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
          aria-label="Hide this"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}

/** The landing page, signed out: an email or WhatsApp number (PRD B12). */
export function SparkContactForm() {
  const [state, action, pending] = useActionState<SparkContactState, FormData>(joinSparkContactAction, undefined);
  if (state?.ok) {
    return (
      <p role="status" className="text-label inline-flex min-h-11 items-center gap-1.5 text-success">
        <Check size={18} aria-hidden="true" />
        You&apos;re on the list
      </p>
    );
  }
  return (
    <form action={action} className="grid w-full max-w-md gap-2">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="spark-contact">
          Your email or WhatsApp number
        </label>
        <input id="spark-contact" name="contact" defaultValue={state?.value} placeholder="Email or WhatsApp number" autoComplete="email" className="input min-w-0 flex-1" />
        <button type="submit" className="btn min-h-11 shrink-0 px-4 text-label" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Get early access
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
