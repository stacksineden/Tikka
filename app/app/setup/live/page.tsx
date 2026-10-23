import type { Metadata } from "next";
import { ArrowRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BioCard } from "@/components/business/BioCard";
import { getBusiness } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your page is live" };

async function Live() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-success-soft text-success">
          <PartyPopper size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-heading">Your page is live</h1>
          <p className="text-body-lg mt-1 text-ink-muted">
            usetikka.com/{b.slug} is ready. Put it in your Instagram and WhatsApp bio.
          </p>
        </div>
      </div>
      <BioCard slug={b.slug} name={b.name} title="Your free business page" />
      <Link href="/app" className="btn btn-lg w-full sm:w-auto">
        Continue to your dashboard
        <ArrowRight />
      </Link>
      <p className="text-caption text-ink-muted">Add services, photos, hours and a video any time in Settings › Business profile. Your page updates straight away.</p>
    </>
  );
}

export default function LivePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-5 px-4 py-10">
      <Suspense fallback={<div className="h-96" />}>
        <Live />
      </Suspense>
    </main>
  );
}
