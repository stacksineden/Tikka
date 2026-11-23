import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { graceDay } from "@/lib/kyc";
import type { PayoutState } from "@/lib/payouts-db";

/**
 * Home, for owners whose payments need an ID check: before the deadline a reminder, after it a
 * paused notice, and Tikka's reason when it asked again. Nothing once the ID is sent or approved.
 */
export function KycNotice({ state }: { state: PayoutState | null }) {
  if (!state || state.kyc?.status === "submitted" || state.kyc?.status === "approved") return null;
  let tone: "warn" | "stop" = "warn";
  let title: string;
  let body: string;
  if (state.kyc?.status === "again") {
    title = "One thing to fix to take payments";
    body = state.kyc.note ?? "Tikka asked you to send your ID again.";
  } else if (state.graceUntil) {
    title = "Verify your business to keep taking payments";
    body = `Add your ID by ${graceDay(state.graceUntil)}. It takes about 3 minutes.`;
  } else if (state.problem === "needs_id") {
    tone = "stop";
    title = "Payments are paused";
    body = "Add your ID to switch deposits and pay links back on. Drops, bookings and redeeming still work.";
  } else {
    return null;
  }
  return (
    <section
      role={tone === "stop" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-card px-4 py-3 sm:px-5 ${tone === "stop" ? "bg-danger-soft text-danger" : "bg-gold-soft"}`}
    >
      <p className="text-body flex min-w-0 flex-1 items-start gap-2">
        {tone === "stop" && <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
        <span>
          <b>{title}.</b> {body}
        </span>
      </p>
      <Link href="/app/settings/get-paid" className="btn min-h-11 shrink-0 px-4 text-label">
        Verify now <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
