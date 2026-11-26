import { Hand, Pencil, Repeat, Zap } from "lucide-react";
import type { MoneyLine } from "@/lib/ledger";

const TAGS: Record<MoneyLine["source"], [string, string, typeof Zap]> = {
  auto: ["Automatic", "bg-success-soft text-success", Zap],
  recorded: ["You recorded", "bg-brand-soft text-brand", Hand],
  added: ["You added", "bg-surface-sunken text-ink", Pencil],
  regular: ["Regular", "bg-surface-sunken text-ink", Repeat],
};

/** Where a number on Money came from, so owners can trust it. */
export function SourceTag({ source }: { source: MoneyLine["source"] }) {
  const [label, cls, Icon] = TAGS[source];
  return (
    <span className={`text-caption inline-flex items-center gap-1 justify-self-start rounded-pill px-2 py-0.5 font-semibold ${cls}`}>
      <Icon size={12} aria-hidden="true" /> {label}
    </span>
  );
}
