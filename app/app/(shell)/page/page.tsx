import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageEditor } from "@/components/page/PageEditor";
import { getBusiness } from "@/lib/data";
import { pageChecklist } from "@/lib/page";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your page" };

async function Editor() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  const steps = pageChecklist(b);
  const done = steps.filter((x) => x.done).length;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading">Your page</h1>
          <p className="text-body mt-1 text-ink-muted">
            Your free website at <span className="font-semibold text-ink">usetikka.com/{b.slug}</span>. Put it in your Instagram and WhatsApp bio.
          </p>
        </div>
        <Link href={`/${b.slug}`} target="_blank" className="btn">
          <ExternalLink />
          View page
        </Link>
      </div>
      {done < steps.length && (
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <p className="text-label">
            Finish your page · {done} of {steps.length}
          </p>
          <ul className="text-caption mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
            {steps.map((x) => (
              <li key={x.id} className={x.done ? "text-success line-through" : ""}>
                {x.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <PageEditor key={b.slug} business={b} />
    </>
  );
}

export default function YourPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Editor />
      </Suspense>
    </div>
  );
}
