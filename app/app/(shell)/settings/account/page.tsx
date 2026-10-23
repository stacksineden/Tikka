import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { OwnerAlerts } from "@/components/settings/OwnerAlerts";
import { getBusiness, ownerNumber } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account" };

async function Account() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const b = user.role === "owner" ? await getBusiness(user) : null;
  return (
    <div className="grid gap-4">
      {b && <OwnerAlerts number={ownerNumber(b) ?? ""} dailySummary={b.dailySummary !== false} />}
      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-6">
        <h2 className="text-title text-[17px] leading-6">Signed in as</h2>
        <p className="text-body mt-2 break-all">{user.email}</p>
        <p className="text-caption mt-1 text-ink-muted">{user.role === "owner" ? "Owner" : "Staff"}</p>
      </section>
      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-6">
        <h2 className="text-title text-[17px] leading-6">Password</h2>
        {/* DEMO: password changes arrive with Supabase Auth (M1). */}
        <p className="text-body mt-2 text-ink-muted">
          To change your password, sign out and use &ldquo;Forgot password?&rdquo; on the sign-in screen. If you sign in with
          Google, your password is managed by Google.
        </p>
      </section>
      <form action={signOut}>
        <button type="submit" className="btn btn-secondary btn-lg w-full text-danger sm:w-auto">
          <LogOut />
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <SettingsPage title="Account">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <Account />
      </Suspense>
    </SettingsPage>
  );
}
