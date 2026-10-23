import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Check your email" };

async function Email({ searchParams }: { searchParams: PageProps<"/forgot-password/sent">["searchParams"] }) {
  const sp = await searchParams;
  return <span className="font-semibold text-ink">{typeof sp.email === "string" ? sp.email : "your email"}</span>;
}

export default function ResetSentPage(props: PageProps<"/forgot-password/sent">) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-pill bg-brand-soft text-brand">
        <MailCheck size={22} aria-hidden="true" />
      </span>
      <h1 className="text-heading mt-6">Check your email</h1>
      <p className="text-body mt-2 text-ink-muted">
        If there&apos;s an account for{" "}
        <Suspense fallback="your email">
          <Email searchParams={props.searchParams} />
        </Suspense>
        , a reset link is on its way. Open it on this phone or computer; it works for one hour.
      </p>
      <p className="text-body mt-8 text-ink-muted">
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
