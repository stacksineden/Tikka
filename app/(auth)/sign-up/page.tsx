import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/Forms";

export const metadata: Metadata = { title: "Start free" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-heading">Start free</h1>
      <p className="text-body mt-2 text-ink-muted">
        Your website, bookings and deposits, set up from your phone in about 10 minutes. Free to start.
      </p>
      <div className="mt-8">
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
      <p className="text-body mt-8 text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
