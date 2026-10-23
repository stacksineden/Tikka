import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { WelcomeTour } from "@/components/dashboard/WelcomeTour";
import { getDropTiers } from "@/lib/data";
import { fromPrice } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome" };

async function Tour() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return <WelcomeTour name={user.name} from={fromPrice(await getDropTiers())} />;
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-night" />}>
      <Tour />
    </Suspense>
  );
}
