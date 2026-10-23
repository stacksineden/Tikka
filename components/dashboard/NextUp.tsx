import Link from "next/link";

/** Placeholder for dashboard sections that later milestones build. */
export function NextUp({ title, body, milestone }: { title: string; body: string; milestone: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-heading">{title}</h1>
      <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface-raised p-6">
        <p className="text-serial font-mono uppercase text-brand">Coming in {milestone}</p>
        <p className="text-body-lg mt-2 text-ink-muted">{body}</p>
        <Link href="/app" className="btn btn-secondary mt-5">
          Back to home
        </Link>
      </div>
    </div>
  );
}
