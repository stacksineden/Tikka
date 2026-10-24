import "server-only";

import type { ReviewRecord, ReviewState } from "./redeem";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Review } from "./types";

// Reviews for businesses in Supabase (rule 6). submit_review() checks redeemed, within 30 days,
// once per claim; report_review() checks the caller owns the business. The checks live there.

interface ReviewRow {
  id: string;
  display_name: string;
  rating: number;
  body: string | null;
  created_at: string;
  status?: "visible" | "reported" | "hidden";
  drop_title?: string | null;
  drops?: { title: string } | null;
}

function reviewFrom(r: ReviewRow): Review {
  return {
    id: r.id,
    name: r.display_name,
    rating: r.rating,
    text: r.body ?? undefined,
    dropName: r.drops?.title ?? r.drop_title ?? "",
    at: r.created_at,
    status: r.status ?? "visible",
  };
}

/** The business page, the claim page and the card link: reviews on show, newest first. */
export async function dbPublicReviews(businessId: string): Promise<Review[]> {
  const sb = await createClient();
  const { data } = await sb.rpc("get_business_reviews", { p_business: businessId, p_page: 0 });
  return ((data ?? []) as ReviewRow[]).map(reviewFrom);
}

/** The owner's Reviews screen: every review, including ones Tikka hid after a report. */
export async function dbOwnerReviews(businessId: string): Promise<Review[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("reviews")
    .select("id, display_name, rating, body, created_at, status, drops(title)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as unknown as ReviewRow[]).map(reviewFrom);
}

export interface ReviewPageDb {
  state: ReviewState;
  firstName: string;
  shownAs: string;
  reward: string;
  businessSlug: string;
  review?: ReviewRecord;
}

/** /t/[token]/review: the view token is the secret, so this runs on the server only. */
export async function dbReviewPage(viewToken: string): Promise<ReviewPageDb | null> {
  const { data } = await adminClient().rpc("review_page", { p_view_token: viewToken });
  const j = data as {
    state: ReviewState;
    first_name: string;
    shown_name: string;
    reward: string;
    business_slug: string;
    review: { rating: number; body: string | null; at: string; status: string } | null;
  } | null;
  if (!j) return null;
  return {
    state: j.state,
    firstName: j.first_name,
    shownAs: j.shown_name,
    reward: j.reward,
    businessSlug: j.business_slug,
    review: j.review ? { rating: j.review.rating, body: j.review.body ?? undefined, at: j.review.at, status: j.review.status === "reported" ? "reported" : "visible" } : undefined,
  };
}

/** submit_review's answer: 'ok' or why not. */
export async function dbSubmitReview(viewToken: string, rating: number, body?: string): Promise<string> {
  const { data, error } = await adminClient().rpc("submit_review", { p_view_token: viewToken, p_rating: rating, p_body: body ?? null });
  if (error) return "error";
  return (data as { kind: string }).kind;
}

/** The owner flags a review for Tikka. */
export async function dbReportReview(reviewId: string, reason: string): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("report_review", { p_review: reviewId, p_reason: reason });
  return !error && data === true;
}
