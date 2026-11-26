import { CircleCheck, Clock3 } from "lucide-react";
import { PayLinkActions } from "@/components/payments/PayLinkActions";
import { ReceiptButton } from "@/components/payments/ReceiptButton";
import type { DemoPayLink } from "@/lib/paylinks-demo";
import { siteUrl } from "@/lib/supabase/env";

// NEW DIRECTION: the string of pay links. Each one is Waiting until the customer pays, then Paid
// (with when); Cancelled when the owner cancels it. Used on Money (the latest) and on Pay links (all).

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });

export function PayLinkList({ links, empty, businessName }: { links: DemoPayLink[]; empty?: string; businessName: string }) {
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
      {links.length === 0 && <li className="text-body px-4 py-3.5 text-ink-muted">{empty ?? "No pay links yet."}</li>}
      {links.map((l) => (
        <li key={l.id} className="grid gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <b className="block">{l.customerName ?? "A customer"}</b>
              <span className="text-caption block text-ink-muted">{l.note}</span>
              <span className="text-caption block text-ink-muted">
                {l.status === "paid" && l.paidAt ? `Paid ${when(l.paidAt)}` : l.status === "cancelled" ? `Sent ${when(l.createdAt)} · cancelled` : `Sent ${when(l.createdAt)}`}
              </span>
            </span>
            <span className="grid shrink-0 justify-items-end gap-1">
              <b className={`text-code ${l.status === "cancelled" ? "text-ink-muted line-through" : ""}`}>{naira(l.amountKobo)}</b>
              {l.status === "paid" ? (
                <span className="text-caption inline-flex items-center gap-1 rounded-pill bg-success-soft px-2 py-0.5 font-semibold text-success">
                  <CircleCheck size={12} aria-hidden="true" /> Paid
                </span>
              ) : l.status === "open" ? (
                <span className="text-caption inline-flex items-center gap-1 rounded-pill bg-gold-soft px-2 py-0.5 font-semibold text-gold-text">
                  <Clock3 size={12} aria-hidden="true" /> Waiting
                </span>
              ) : (
                <span className="text-caption rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-muted">Cancelled</span>
              )}
            </span>
          </div>
          {l.status === "open" && <PayLinkActions id={l.id} url={`${siteUrl()}/pay/${l.token}`} />}
          {l.status === "paid" && l.saleId && (
            <div>
              <ReceiptButton saleId={l.saleId} name={l.customerName ?? ""} phone={l.phone} item={l.note} businessName={businessName} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Waiting ones first (oldest waiting first), then the rest newest first. */
export function waitingFirst(links: DemoPayLink[]): DemoPayLink[] {
  const open = links.filter((l) => l.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...open, ...links.filter((l) => l.status !== "open")];
}
