import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/Forms";
import { demoAllowed } from "@/lib/session";
import { openDemoBusiness, startNewDemoBusiness } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-heading">Welcome back</h1>
      <p className="text-body mt-2 text-ink-muted">Sign in to see your drops and leads.</p>
      <div className="mt-8">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
      <p className="text-body mt-8 text-ink-muted">
        New to Tikka?{" "}
        <Link href="/sign-up" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
      {/* DEMO (development only): the Glow Studio demo data has no real account behind it. */}
      {demoAllowed && (
        <form action={openDemoBusiness} className="mt-8 rounded-md border border-dashed border-line-strong p-4">
          <p className="text-caption text-ink-muted">Development only: the demo business, without an account.</p>
          <button type="submit" className="btn btn-secondary mt-3 w-full">
            Open the demo business
          </button>
        </form>
      )}
      {/* NEW DIRECTION, stage 1 (development only): the new setup from the first screen, in memory only. */}
      {demoAllowed && (
        <form action={startNewDemoBusiness} className="mt-3 rounded-md border border-dashed border-line-strong p-4">
          <p className="text-caption text-ink-muted">Development only: try the new setup as a brand-new business. Nothing is saved to the database.</p>
          <button type="submit" className="btn btn-primary mt-3 w-full">
            Start a new business (demo)
          </button>
        </form>
      )}
    </>
  );
}
