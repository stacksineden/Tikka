"use server";

import { submitReview } from "@/lib/data";

export type ReviewFormState = { ok?: boolean; error?: string } | undefined;

export async function sendReview(token: string, _prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const r = await submitReview(token, form.get("rating"), form.get("body"));
  return r.ok ? { ok: true } : { error: r.error };
}
