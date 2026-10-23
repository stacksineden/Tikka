import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cancelInviteAction } from "@/app/app/actions";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { InviteStaffForm, RemoveStaffButton } from "@/components/team/TeamForms";
import { getTeam } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Team" };

async function Team() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const team = await getTeam(user);
  if (!team) redirect("/app/redeem");

  return (
    <>
      <p className="text-label flex items-start gap-2 rounded-md bg-brand-soft px-3 py-2.5 font-medium text-ink">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
        Staff can only redeem codes. They never see your leads, phone numbers, drops or settings.
      </p>

      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-6" aria-labelledby="invite-h">
        <h2 id="invite-h" className="text-title text-[17px] leading-6">
          Invite staff
        </h2>
        <p className="text-body mt-1 text-ink-muted">They sign in with Google or an email and password, then go straight to Redeem.</p>
        <div className="mt-4">
          <InviteStaffForm />
        </div>
      </section>

      <section aria-labelledby="people-h" className="grid gap-2">
        <h2 id="people-h" className="text-label px-1 text-ink-muted">
          People
        </h2>
        <ul className="overflow-hidden rounded-card border border-line bg-surface-raised">
          <li className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="text-body block font-semibold">{user.name} (you)</span>
              <span className="text-caption block truncate text-ink-muted">{user.email}</span>
            </span>
            <span className="text-caption rounded-pill bg-brand-soft px-2 py-0.5 font-semibold text-brand">Owner</span>
          </li>
          {team.staff.map((m) => (
            <li key={m.userId} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="text-body block font-semibold">{m.name}</span>
                <span className="text-caption block truncate text-ink-muted">
                  {m.email} · Staff since {shortDate(m.addedAt)}
                </span>
              </span>
              <RemoveStaffButton userId={m.userId} name={m.name} />
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.token} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="text-body block truncate font-semibold">{i.email}</span>
                <span className="text-caption block text-ink-muted">Invited · link works till {shortDate(i.expiresAt)}</span>
              </span>
              <form action={cancelInviteAction}>
                <input type="hidden" name="token" value={i.token} />
                <button type="submit" className="text-label min-h-11 rounded-md px-2 text-ink-muted">
                  Cancel invite
                </button>
              </form>
            </li>
          ))}
        </ul>
        {team.staff.length === 0 && team.invites.length === 0 && <p className="text-caption px-1 text-ink-muted">No staff yet. Invite whoever works your counter.</p>}
      </section>
    </>
  );
}

export default function Page() {
  return (
    <SettingsPage title="Team" intro="The people who redeem Tikkas at your counter.">
      <Suspense fallback={<div className="h-64 rounded-card bg-surface-sunken" />}>
        <Team />
      </Suspense>
    </SettingsPage>
  );
}
