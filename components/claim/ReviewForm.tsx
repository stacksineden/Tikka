"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendReview, type ReviewFormState } from "@/app/(claim)/t/[token]/review/actions";
import { Star, Tick } from "@/components/tikka/glyphs";
import { REVIEW_MAX } from "@/lib/redeem";

const WORDS = ["", "Not good", "Could be better", "Okay", "Good", "Loved it"];

/** Five stars (required) and one optional line (PRD A4). */
export function ReviewForm({ token, businessName, shownAs, initialRating }: { token: string; businessName: string; shownAs: string; initialRating?: number }) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(sendReview.bind(null, token), undefined);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [body, setBody] = useState("");

  if (state?.ok) {
    return (
      <div className="tk-box text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-pill bg-gold text-on-gold">
          <Tick className="size-6" />
        </span>
        <h2 className="tk-h">Thanks. Your review is on {businessName}&apos;s card now.</h2>
        <Link href={`/t/${token}`} className="tk-btn tk-btn-paper mt-6">
          See my Tikka
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5" noValidate>
      <fieldset className="grid gap-2">
        <legend className="tk-label mb-2 text-on-night">Your rating</legend>
        <div className="tk-stars" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`tk-star cursor-pointer ${n <= rating ? "" : "opacity-40"}`}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" aria-label={`${n} star${n === 1 ? "" : "s"}`} />
              <Star />
            </label>
          ))}
        </div>
        <p className="tk-fine mt-0 min-h-4" aria-live="polite">
          {WORDS[rating]}
        </p>
      </fieldset>

      <div className="tk-field">
        <label htmlFor="tk-review-body" className="tk-label text-on-night">
          Anything to add? (optional)
        </label>
        <textarea
          id="tk-review-body"
          name="body"
          maxLength={REVIEW_MAX}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`What was good about ${businessName}?`}
          className="tk-input tk-textarea"
        />
        <p className="tk-fine mt-0 text-right">
          {body.length} / {REVIEW_MAX}
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="tk-error rounded-md bg-surface px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid gap-2">
        <button type="submit" className="tk-btn tk-btn-gold" disabled={pending}>
          {pending ? "Sending…" : "Send review"}
        </button>
        <p className="tk-cta-note text-center">Shown as {shownAs} · Used a Tikka</p>
      </div>
    </form>
  );
}
