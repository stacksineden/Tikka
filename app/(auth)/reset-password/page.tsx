import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/Forms";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-heading">Set a new password</h1>
      <p className="text-body mt-2 text-ink-muted">You&apos;ll be signed in straight after.</p>
      <div className="mt-8">
        <ResetForm />
      </div>
    </>
  );
}
