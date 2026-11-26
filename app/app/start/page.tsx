import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StartFlow } from "@/components/start/StartFlow";
import { getBusiness, isDbId } from "@/lib/data";
import { demoAllowed, getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your business" };

// The new setup (docs/OWNER_JOURNEYS.md journey 1), for every new business (docs/DB_MOVE.md step 1).
// Real accounts save to Supabase; the demo saves to the demo store. A business set up the old way
// already has its page, so it goes to the dashboard (its "finish setting up" is step 8).
async function Start() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/app/start");
  if (user.role !== "owner") redirect("/app/redeem");
  const real = isDbId(user.id);
  if (!real && !demoAllowed) redirect("/sign-in");
  const b = await getBusiness(user);
  if (b && !b.trades?.length) redirect("/app");
  return <StartFlow real={real} ownerName={user.name} />;
}

export default function StartPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Start />
    </Suspense>
  );
}
