import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { getClient } from "@/lib/clients-data";
import { possibleMatches } from "@/lib/clients";
import { getBusiness, isDbId } from "@/lib/data";
import { payLinkLimit } from "@/lib/paylinks-data";
import { getOwnerUser } from "@/lib/session";
import { LoadingGrid } from "@/components/ui/Loading";

export const metadata: Metadata = { title: "Customer" };

// NEW DIRECTION: one customer in the client book. Owners only (rule 4).
async function Customer({ params }: { params: PageProps<"/app/leads/[key]">["params"] }) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [{ key }, b] = await Promise.all([params, getBusiness(user)]);
  if (!b) redirect("/app/setup");
  await connection();
  const [found, limit] = await Promise.all([getClient(user, decodeURIComponent(key)), payLinkLimit(user)]);
  if (!found) notFound();
  const matches = possibleMatches(found.client, found.all).map((m) => ({ key: m.key, name: m.name, phone: m.phone!, visits: m.visits }));
  // Pay links: real once payments are ready (lib/paylinks-data.ts), else the demo store.
  return <ClientDetail client={found.client} matches={matches} businessName={b.name} now={new Date().toISOString()} payMaxKobo={limit.ready ? limit.maxKobo : undefined} />;
}

export default function Page(props: PageProps<"/app/leads/[key]">) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<LoadingGrid />}>
        <Customer params={props.params} />
      </Suspense>
    </div>
  );
}
