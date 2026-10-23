import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/Forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-heading">Reset your password</h1>
      <p className="text-body mt-2 text-ink-muted">
        Enter the email you signed up with and we&apos;ll send you a link to set a new one.
      </p>
      <div className="mt-8">
        <ForgotForm />
      </div>
      <p className="text-body mt-8 text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
