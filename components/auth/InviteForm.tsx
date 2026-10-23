"use client";

import { useActionState } from "react";
import { acceptStaffInvite, type FormState } from "@/app/(auth)/actions";
import { Divider, Field, FormError, GoogleG, PasswordField, SubmitButton } from "./AuthBits";

/** Join a business as staff: Google, or a name and password for the invited email. */
export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptStaffInvite.bind(null, token), undefined);
  return (
    <div className="grid gap-5">
      <form action={action}>
        <input type="hidden" name="method" value="google" />
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="btn btn-secondary btn-lg w-full">
          <GoogleG />
          Continue with Google
        </button>
      </form>
      <Divider />
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <FormError message={state?.error} />
        <Field label="Email" name="email-shown" type="email" value={email} readOnly disabled />
        <Field label="Your name" name="name" autoComplete="name" required defaultValue={state?.fields?.name} />
        <PasswordField autoComplete="new-password" hint="At least 8 characters." />
        <SubmitButton pendingLabel="Joining…">Join and start redeeming</SubmitButton>
      </form>
    </div>
  );
}
