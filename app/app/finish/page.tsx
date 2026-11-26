import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FinishSetup } from "@/components/finish/FinishSetup";
import { getBusiness } from "@/lib/data";
import { finishSetupMissing } from "@/lib/experience";
import { presetRules, travelFeeFor, type TradeId } from "@/lib/presets";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Finish setting up" };

// For a business set up the old way (docs/DB_MOVE.md step 8): three quick questions, one per screen.
async function Finish() {
  const user = await getOwnerUser();
  if (!user) redirect("/sign-in?next=/app/finish");
  const b = await getBusiness(user);
  if (!b) redirect("/app/start");
  if (!finishSetupMissing(b).length) redirect("/app");
  // A photographer's category suggests the trade; anyone else picks.
  const suggested: TradeId[] = b.trades?.length ? (b.trades as TradeId[]) : b.category === "Photography" ? ["photo"] : [];
  const workPlace = b.workPlace ?? (b.serveMode === "come_to_you" ? "home" : null);
  return (
    <FinishSetup
      business={{ name: b.name, area: b.area, city: b.city, state: b.state }}
      initial={{
        trades: suggested,
        workPlace,
        travelFee: b.travelFee ?? travelFeeFor(b.state),
        travelReach: b.travelReach ?? "city",
        rules: b.bookingRules?.length ? b.bookingRules : presetRules(workPlace ?? "shop", b.services.some((s) => s.eventDay)),
      }}
    />
  );
}

export default function FinishPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Finish />
    </Suspense>
  );
}
