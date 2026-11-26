import { Wallet } from "lucide-react";
import Link from "next/link";

// Why a real business can't send pay links yet, with the one step that fixes it (Get paid).
const WHY = {
  no_account: "Add the bank account payments go to, then you can send pay links.",
  account_again: "Add your bank account again to send pay links.",
  closed: "Add your ID and bank account on Get paid. Once we've checked your ID, you can send pay links.",
} as const;

export function PayLinksOff({ why }: { why: keyof typeof WHY }) {
  return (
    <Link href="/app/settings/get-paid" className="flex min-h-14 items-start gap-3 rounded-md border border-line bg-surface-raised px-4 py-3">
      <Wallet size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="text-body">{WHY[why]}</span>
    </Link>
  );
}
