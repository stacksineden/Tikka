import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InviteForm } from "@/components/auth/InviteForm";
import { getInvite } from "@/lib/data";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

async function Invite({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const wrongEmail = (await searchParams).error === "email";
  const invite = await getInvite(token);
  if (!invite) notFound();
  const b = invite.business;

  return (
    <>
      <span className="grid size-14 place-items-center overflow-hidden rounded-pill text-[20px] font-extrabold" style={{ background: b.brandColor, color: b.onBrandColor }} aria-hidden="true">
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="" className="size-full object-cover" />
        ) : (
          b.initials
        )}
      </span>
      {invite.state === "open" ? (
        <>
          <h1 className="text-heading mt-4">Join {b.name} on Tikka</h1>
          <p className="text-body mt-2 text-ink-muted">You&apos;ll redeem Tikka codes at the counter. That&apos;s all staff see: no customer numbers, no settings.</p>
          {wrongEmail && (
            <p role="alert" className="text-body mt-4 rounded-md bg-danger-soft p-3 text-danger">
              This invite is for {invite.email}. Sign in with that email, or ask the owner to invite the email you use.
            </p>
          )}
          <div className="mt-8">
            <InviteForm token={token} email={invite.email} />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-heading mt-4">{invite.state === "accepted" ? "This invite was already used" : "This invite has expired"}</h1>
          <p className="text-body mt-2 text-ink-muted">Ask {b.name}&apos;s owner to send you a new one from Settings › Team.</p>
          <Link href="/sign-in" className="btn btn-secondary mt-6">
            Sign in instead
          </Link>
        </>
      )}
    </>
  );
}

export default function Page(props: PageProps<"/invite/[token]">) {
  return (
    <Suspense>
      <Invite {...props} />
    </Suspense>
  );
}
