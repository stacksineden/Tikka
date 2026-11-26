import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { WelcomeTour } from "@/components/dashboard/WelcomeTour";
import { getBusiness, getDropTiers, isDbId } from "@/lib/data";
import { fromPrice } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";
import { dbInviteAcceptPath } from "@/lib/team-db";

export const metadata: Metadata = { title: "Welcome" };

async function Tour() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  // Invited staff who land here (an old confirmation link, or signing up on their own) join the
  // business that invited them instead of setting up one of their own.
  const invite = isDbId(user.id) ? await dbInviteAcceptPath(user.email).catch(() => null) : null;
  if (invite) redirect(invite);
  // Real owners skip the old drops tour (docs/DB_MOVE.md step 8): the new setup, or their dashboard.
  if (isDbId(user.id) && user.role === "owner") redirect((await getBusiness(user)) ? "/app" : "/app/start");
  return <WelcomeTour name={user.name} from={fromPrice(await getDropTiers())} />;
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-night" />}>
      <Tour />
    </Suspense>
  );
}
