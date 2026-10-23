import { Gift, X } from "lucide-react";
import Link from "next/link";
import { dismissGuaranteeAction } from "@/app/app/actions";

/** The guarantee paid out: a free drop of the same size is ready (PRD B5). */
export function GuaranteeNotice({ message }: { message: string }) {
  return (
    <section className="flex items-start gap-3 rounded-card border border-gold bg-gold-soft p-4" role="status">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-raised text-gold-text">
        <Gift size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{message}</p>
        <Link href="/app/drops/new" className="text-label mt-1 inline-flex min-h-11 items-center text-brand">
          Create your next drop
        </Link>
      </div>
      <form action={dismissGuaranteeAction}>
        <button type="submit" aria-label="Dismiss" className="grid size-11 place-items-center rounded-md text-ink-muted">
          <X size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
