import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { CardLookEditor } from "@/components/setup/SettingsEditors";
import { getBusiness } from "@/lib/data";
import { dropReturn } from "@/lib/drop";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Card look" };

async function Editor() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  return <CardLookEditor key={`${user.id}:${b.id}`} business={b} />;
}

/** From the first drop's check screen ("Make your card yours"): the way back to that drop. */
async function BackToDrop({ searchParams, bottom = false }: { searchParams: PageProps<"/app/settings/card">["searchParams"]; bottom?: boolean }) {
  const href = dropReturn((await searchParams).back);
  if (!href) return bottom ? null : (
    <Link href="/app/settings" className="text-label -ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-brand">
      <ChevronLeft size={18} aria-hidden="true" />
      Settings
    </Link>
  );
  return bottom ? (
    <Link href={href} className="btn btn-lg btn-secondary w-full sm:w-auto sm:justify-self-start">
      Back to your drop
    </Link>
  ) : (
    <Link href={href} className="text-label -ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-brand">
      <ChevronLeft size={18} aria-hidden="true" />
      Back to your drop
    </Link>
  );
}

export default function CardLookPage(props: PageProps<"/app/settings/card">) {
  return (
    <SettingsPage
      title="Card look"
      intro="The front of every Tikka you drop. Changes show on new and live drops."
      wide
      back={
        <Suspense fallback={<span className="block min-h-11" />}>
          <BackToDrop searchParams={props.searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Editor />
      </Suspense>
      <Suspense fallback={null}>
        <BackToDrop searchParams={props.searchParams} bottom />
      </Suspense>
    </SettingsPage>
  );
}
