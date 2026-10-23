import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { confirmEmail } from "../actions";

export const metadata: Metadata = { title: "Confirm your email" };

async function Sent({ searchParams }: { searchParams: PageProps<"/check-email">["searchParams"] }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const name = typeof sp.name === "string" ? sp.name : "";
  return (
    <>
      <p className="text-body mt-2 text-ink-muted">
        We sent a link to <span className="font-semibold text-ink">{email || "your email"}</span>. Tap it to confirm
        and open your dashboard.
      </p>

      {/* DEMO ONLY: stands in for tapping the link in the email until Supabase Auth is wired. */}
      <form action={confirmEmail} className="mt-8 rounded-md border border-dashed border-line-strong p-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="name" value={name} />
        <p className="text-caption text-ink-muted">Demo: no email is sent yet.</p>
        <button type="submit" className="btn mt-3 w-full">
          Open the confirmation link
        </button>
      </form>
    </>
  );
}

export default function CheckEmailPage(props: PageProps<"/check-email">) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-pill bg-brand-soft text-brand">
        <MailCheck size={22} aria-hidden="true" />
      </span>
      <h1 className="text-heading mt-6">Check your email</h1>
      <Suspense>
        <Sent searchParams={props.searchParams} />
      </Suspense>
      <p className="text-body mt-8 text-ink-muted">
        Didn&apos;t get it? Check spam, or{" "}
        <Link href="/sign-up" className="font-semibold text-brand hover:underline">
          try a different email
        </Link>
        .
      </p>
    </>
  );
}
