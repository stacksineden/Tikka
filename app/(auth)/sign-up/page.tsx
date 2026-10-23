import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/Forms";

export const metadata: Metadata = { title: "Start free" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-heading">Start free</h1>
      <p className="text-body mt-2 text-ink-muted">
        Set up your card and run your first drop today. Free to start.
      </p>
      <div className="mt-8">
        <SignUpForm />
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
