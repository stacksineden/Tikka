import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SetupFlow } from "@/components/setup/SetupFlow";
import { SWATCHES } from "@/lib/color";
import { getBusiness } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import type { CardDraft } from "@/lib/setup";

export const metadata: Metadata = { title: "Set up your card" };

async function Setup() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/app/setup");
  if (user.role !== "owner") redirect("/app/redeem");
  const b = await getBusiness(user);
  const initial: CardDraft = b
    ? {
        name: b.name,
        category: b.category,
        state: b.state,
        city: b.city,
        area: b.area,
        brandColor: b.brandColor,
        logoUrl: b.logoUrl,
        background: b.background,
        actions: b.actions,
        codePrefix: b.codePrefix,
        tagline: b.tagline ?? "",
        services: b.services,
        slug: b.slug,
        address: b.address ?? "",
      }
    : {
        name: "",
        category: "",
        state: "",
        city: "",
        area: "",
        brandColor: SWATCHES[0].hex,
        background: { type: "color" },
        actions: [{ kind: "whatsapp", value: "" }],
        codePrefix: "",
        tagline: "",
        services: [],
        slug: "",
      };
  return <SetupFlow initial={initial} />;
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Setup />
    </Suspense>
  );
}
