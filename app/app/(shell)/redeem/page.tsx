import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RedeemScreen } from "@/components/redeem/RedeemScreen";
import { getBusiness, memberBusinessId } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Redeem" };

async function Redeem() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/app/redeem");
  const ownerId = await memberBusinessId(user);
  const b = ownerId ? await getBusiness({ id: ownerId }) : null;
  if (!b) {
    if (user.role === "owner") redirect("/app/setup");
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-heading">Redeem</h1>
        <p className="text-body-lg mt-3 text-ink-muted">You&apos;re not on a team any more. Ask the business owner to invite you again.</p>
      </div>
    );
  }
  return <RedeemScreen businessName={b.name} prefix={b.codePrefix} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-md" />}>
      <Redeem />
    </Suspense>
  );
}
