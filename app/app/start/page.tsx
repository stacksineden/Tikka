import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StartFlow } from "@/components/start/StartFlow";
import { isDbId } from "@/lib/data";
import { demoAllowed, getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your business" };

// NEW DIRECTION, stage 1: the new setup (docs/OWNER_JOURNEYS.md journey 1). Demo businesses only
// for now, so nothing here touches Supabase; real accounts keep the current setup.
async function Start() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!demoAllowed || isDbId(user.id)) redirect("/app/setup");
  if (user.role !== "owner") redirect("/app/redeem");
  return <StartFlow />;
}

export default function StartPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Start />
    </Suspense>
  );
}
