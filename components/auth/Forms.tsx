"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import {
  continueWithGoogle,
  requestReset,
  resetPassword,
  signIn,
  signUp,
  type FormState,
} from "@/app/(auth)/actions";
import { Divider, Field, FormError, GoogleG, PasswordField, SubmitButton } from "./AuthBits";

function GoogleButton({ intent, next }: { intent: "sign-in" | "sign-up"; next?: string }) {
  return (
    <form action={continueWithGoogle}>
      <input type="hidden" name="intent" value={intent} />
      {next && <input type="hidden" name="next" value={next} />}
      <button type="submit" className="btn btn-secondary btn-lg w-full">
        <GoogleG />
        Continue with Google
      </button>
    </form>
  );
}

export function SignInForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState<FormState, FormData>(signIn, undefined);
  return (
    <div className="grid gap-5">
      <GoogleButton intent="sign-in" next={next} />
      <Divider />
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormError message={state?.error} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state?.fields?.email}
          aria-invalid={!!state?.error}
        />
        <PasswordField
          extra={
            <Link href="/forgot-password" className="text-label text-brand hover:underline">
              Forgot password?
            </Link>
          }
        />
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </form>
    </div>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUp, undefined);
  return (
    <div className="grid gap-5">
      <GoogleButton intent="sign-up" />
      <Divider />
      <form action={action} className="grid gap-4" noValidate>
        <FormError message={state?.error} />
        <Field label="Your name" name="name" autoComplete="name" required defaultValue={state?.fields?.name} />
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state?.fields?.email}
        />
        <PasswordField autoComplete="new-password" hint="At least 8 characters." />
        <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
        <p className="text-caption text-ink-muted">
          By creating an account you agree to Tikka&apos;s terms and privacy policy.
        </p>
      </form>
    </div>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(requestReset, undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={state?.error} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state?.fields?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={state?.error} />
      <PasswordField label="New password" autoComplete="new-password" hint="At least 8 characters." />
      <PasswordField label="Type it again" name="confirm" autoComplete="new-password" />
      <SubmitButton pendingLabel="Saving…">Save and sign in</SubmitButton>
    </form>
  );
}
