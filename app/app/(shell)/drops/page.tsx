import type { Metadata } from "next";
import { CalendarClock, ChevronRight, Pencil, Plus, RotateCcw, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { deleteDraft } from "@/app/app/actions";
import { SoloCard } from "@/components/tikka/SoloCard";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { getBusiness, getDrops } from "@/lib/data";
import { clockTime, count, left, nairaShort, percent, shortDate } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import type { Drop } from "@/lib/types";

export const metadata: Metadata = { title: "Drops" };

const STATUS: Record<Drop["status"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-success-soft text-success" },
  scheduled: { label: "Scheduled", cls: "bg-brand-soft text-brand" },
  draft: { label: "Draft", cls: "bg-surface-sunken text-ink-muted" },
  sold_out: { label: "Sold out", cls: "bg-gold-soft text-gold-text" },
  ended: { label: "Ended", cls: "bg-surface-sunken text-ink-muted" },
};

function when(d: Drop) {
  const at = (iso: string) => `${shortDate(iso)}, ${clockTime(iso)}`;
  switch (d.status) {
    case "draft":
      return "Not published yet";
    case "scheduled":
      return `Opens ${at(d.startsAt)} · ends ${shortDate(d.endsAt)}`;
    case "live":
      return `Ends ${at(d.endsAt)}`;
    default:
      return `${shortDate(d.startsAt)} – ${shortDate(d.endsAt)}`;
  }
}

function DropCard({ d }: { d: Drop }) {
  const s = STATUS[d.status];
  const remaining = d.total - d.claimed;
  const href = d.status === "draft" ? `/app/drops/new?draft=${d.id}` : `/app/drops/${d.id}`;
  const past = d.status === "ended" || d.status === "sold_out";
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface-raised">
      <Link href={href} className="block p-4 active:bg-surface-sunken sm:p-5 lg:hover:bg-surface-sunken/50">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-caption inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-semibold ${s.cls}`}>
            {d.status === "live" && <span className="size-1.5 rounded-pill bg-success" aria-hidden="true" />}
            {s.label}
          </span>
          <span className="text-caption text-ink-muted">{when(d)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h2 className="text-title min-w-0 truncate text-[18px] leading-6">{d.name}</h2>
          <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
        </div>

        {d.status !== "draft" && (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
              <div className="bg-success" style={{ width: percent(d.redeemed, d.total, 2) }} />
              <div className="bg-brand" style={{ width: percent(d.claimed - d.redeemed, d.total, 2) }} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <dt className="text-caption text-ink-muted">{d.status === "scheduled" ? "Tikkas" : "Left"}</dt>
                <dd className="text-label tabular-nums">{d.status === "scheduled" ? count(d.total) : left(remaining, d.total).replace(" left", "")}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Claims · redeemed</dt>
                <dd className="text-label tabular-nums">
                  {count(d.claimed)} · {count(d.redeemed)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Brought in</dt>
                <dd className="text-label tabular-nums">{nairaShort(d.revenue)}</dd>
              </div>
            </dl>
          </>
        )}
        {d.status === "draft" && (
          <p className="text-caption mt-1 text-ink-muted">
            {count(d.total)} Tikkas · {d.rewards.length} rewards set up
            {d.pendingPaymentId ? " · waiting for payment" : ""}
          </p>
        )}
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
        {d.status === "draft" && d.pendingPaymentId && (
          <Link href={`/app/pay?payment=${d.pendingPaymentId}`} className="btn min-h-10 px-3 text-label">
            Finish paying
          </Link>
        )}
        {d.status === "draft" && (
          <>
            <Link href={href} className={`btn min-h-10 px-3 text-label ${d.pendingPaymentId ? "btn-secondary" : ""}`}>
              <Pencil />
              Continue
            </Link>
            <form action={deleteDraft.bind(null, d.id)}>
              <button type="submit" className="btn btn-ghost min-h-10 px-3 text-label text-danger">
                <Trash2 />
                Delete draft
              </button>
            </form>
          </>
        )}
        {(d.status === "live" || d.status === "scheduled") && (
          <Link href={`/app/drops/${d.id}`} className="btn btn-secondary min-h-10 px-3 text-label">
            <Share2 />
            Share
          </Link>
        )}
        {past && (
          <Link href={`/app/drops/new?from=${d.id}`} className="btn btn-secondary min-h-10 px-3 text-label">
            <RotateCcw />
            Run it again
          </Link>
        )}
      </div>
    </li>
  );
}

async function DropsList() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const business = await getBusiness(user);
  const drops = await getDrops(user);

  if (!business) {
    return (
      <div className="rounded-card border border-line bg-surface-raised p-6">
        <h2 className="text-title">Set up your card first</h2>
        <p className="text-body mt-1 text-ink-muted">Every drop uses your card, so it takes about 3 minutes before your first drop.</p>
        <Link href="/app/setup" className="btn mt-4">
          Set up your card
        </Link>
      </div>
    );
  }

  if (drops.length === 0) {
    return (
      <div className="grid items-center gap-6 rounded-card border border-line bg-surface-raised p-6 sm:grid-cols-[auto_1fr]">
        <div className="stage mx-auto rounded-card bg-night p-5">
          <SoloCard zoom={0.5} face={faceFromBusiness(business)} total={500} finish="foil" label={`${business.name}'s Tikka card`} />
        </div>
        <div>
          <h2 className="text-title">No drops yet</h2>
          <p className="text-body mt-1 text-ink-muted">
            A drop is a batch of Tikkas behind one link. Pick how many, what&apos;s inside, and when it ends. It takes a few minutes.
          </p>
          <Link href="/app/drops/new" className="btn btn-lg mt-5">
            <Plus />
            Create your first drop
          </Link>
          <p className="text-body mt-4 text-ink-muted">
            Want us to plan and launch it for you?{" "}
            <Link href="/studio/contact" className="font-semibold text-brand underline">
              Talk to Tikka Studio.
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const groups: [string, Drop[]][] = [
    ["Running", drops.filter((d) => d.status === "live" || d.status === "scheduled")],
    ["Drafts", drops.filter((d) => d.status === "draft")],
    ["Past drops", drops.filter((d) => d.status === "ended" || d.status === "sold_out")],
  ];
  return (
    <div className="grid gap-8">
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <section key={title} className="grid gap-3" aria-labelledby={`g-${title}`}>
            <h2 id={`g-${title}`} className="text-label text-ink-muted">
              {title} · {list.length}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((d) => (
                <DropCard key={d.id} d={d} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function CreateLink() {
  return (
    <Link href="/app/drops/new" className="btn">
      <Plus />
      Create a drop
    </Link>
  );
}

/** One live drop plus one scheduled at a time (PRD B4): disabled, with the reason, when both exist. */
async function CreateButton() {
  const user = await getSessionUser();
  if (!user) return <CreateLink />;
  const drops = await getDrops(user);
  const live = drops.find((d) => d.status === "live" || d.status === "sold_out");
  const next = drops.find((d) => d.status === "scheduled");
  if (!live || !next) return <CreateLink />;
  return (
    <div className="grid gap-1 sm:justify-items-end">
      <button type="button" className="btn" disabled aria-describedby="create-why">
        <Plus />
        Create a drop
      </button>
      <p id="create-why" className="text-caption max-w-xs text-ink-muted sm:text-right">
        You have a live drop and one scheduled. You can create the next after {next.name} opens on {shortDate(next.startsAt)}.
      </p>
    </div>
  );
}

export default function DropsPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading">Drops</h1>
          <p className="text-body mt-1 flex items-center gap-1.5 text-ink-muted">
            <CalendarClock size={16} aria-hidden="true" />
            Each drop is one link with its own Tikkas.
          </p>
        </div>
        <Suspense fallback={<CreateLink />}>
          <CreateButton />
        </Suspense>
      </div>
      <Suspense fallback={<div className="h-64 rounded-card bg-surface-sunken" />}>
        <DropsList />
      </Suspense>
    </div>
  );
}
