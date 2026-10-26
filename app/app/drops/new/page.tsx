import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SimpleBuilder } from "@/components/drops/SimpleBuilder";
import { getBusiness, getDrop, getDrops, getDropTemplates, getDropTiers, getVouchers } from "@/lib/data";
import { blankDraft, copyDraft, setTotal, sizeAdvice } from "@/lib/drop";
import { getSessionUser } from "@/lib/session";
import { sparkState } from "@/lib/studio-db";
import { templateCategory } from "@/lib/templates";
import { usable } from "@/lib/vouchers";

export const metadata: Metadata = { title: "Create a drop" };

async function Builder({ searchParams }: { searchParams: PageProps<"/app/drops/new">["searchParams"] }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/app/drops/new");
  if (user.role !== "owner") redirect("/app/redeem");
  const business = await getBusiness(user);
  if (!business) redirect("/app/setup");

  const sp = await searchParams;
  const draftId = typeof sp.draft === "string" ? sp.draft : undefined;
  const fromId = typeof sp.from === "string" ? sp.from : undefined;
  await connection(); // dates and drafts are per request
  const now = new Date();
  const [tiers, vouchers, templates, drops, spark] = await Promise.all([
    getDropTiers(),
    getVouchers(user),
    getDropTemplates(templateCategory(business.category)),
    getDrops(user, now),
    sparkState(business.id),
  ]);

  let initial = blankDraft(now);
  let step = 0;
  let editing = false;
  if (draftId) {
    const found = await getDrop(user, draftId, now);
    if (!found) redirect("/app/drops");
    if (found.drop.status !== "draft") redirect(`/app/drops/${draftId}`);
    initial = found.draft;
    editing = true;
    step = 1;
  } else if (fromId) {
    // "Run it again": the same offer, fresh dates, straight to the check (PRD B5).
    const found = await getDrop(user, fromId, now);
    if (found) {
      initial = copyDraft(found.draft, now, fromId);
      step = 3;
    }
  } else {
    // First drop: the free size is preselected (up to 200).
    const free = tiers.find((t) => t.id === "free");
    if (free && vouchers.some((v) => v.source === "signup" && usable(v, now))) initial = setTotal(initial, free.maxCards);
  }

  // A size suggested from the most recent drop that has finished (or nearly sold out).
  const past = drops.find((d) => d.status === "ended" || d.status === "sold_out" || (d.status === "live" && d.claimed / d.total > 0.9));
  const pastSuggest = sizeAdvice(past ? { name: past.name, total: past.total, claimed: past.claimed } : undefined);

  return (
    <SimpleBuilder
      key={fromId ?? draftId ?? "new"}
      initial={initial}
      initialStep={step}
      business={business}
      templates={templates}
      tiers={tiers}
      vouchers={vouchers}
      pastSuggest={pastSuggest}
      editing={editing}
      spark={spark.dismissed.includes("spark_builder") ? null : { onList: spark.onList }}
    />
  );
}

export default function NewDropPage(props: PageProps<"/app/drops/new">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Builder searchParams={props.searchParams} />
    </Suspense>
  );
}
