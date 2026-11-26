"use client";

// NEW DIRECTION: the client book. One row per customer, with how often they come, what they've
// spent, when they last came and anything they owe. Search, sort and filter on the phone.

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPhone, matchesSearch, relativeDay, sortClients, type Client, type ClientSort } from "@/lib/clients";

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
const SORTS: [ClientSort, string][] = [
  ["recent", "Recent"],
  ["visits", "Most visits"],
  ["spent", "Top spenders"],
  ["away", "Not seen lately"],
  ["owes", "Owes you"],
];
const FROM: ["all" | Client["sources"][number], string][] = [
  ["all", "Everyone"],
  ["booking", "Booked"],
  ["walk_in", "Walk-ins"],
  ["drop", "From drops"],
];

export function ClientList({ clients, now }: { clients: Client[]; now: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ClientSort>("recent");
  const [from, setFrom] = useState<(typeof FROM)[number][0]>("all");
  const at = useMemo(() => new Date(now), [now]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = clients.filter((c) => (from === "all" || c.sources.includes(from)) && (!t || matchesSearch(c, t)));
    return sortClients(base, sort);
  }, [clients, q, sort, from]);
  const owed = clients.reduce((n, c) => n + c.owedKobo, 0);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Customers" value={String(clients.length)} />
        <Stat label="Came back" value={String(clients.filter((c) => c.visits > 1).length)} />
        <Stat label="Owe you" value={naira(owed)} />
      </div>
      <label className="flex h-12 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 focus-within:outline-2 focus-within:outline-brand">
        <Search size={18} className="text-ink-muted" aria-hidden="true" />
        <input aria-label="Search customers" className="h-full min-w-0 flex-1 bg-transparent outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number" />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Sort">
        {SORTS.map(([k, l]) => (
          <Chip key={k} on={sort === k} onClick={() => setSort(k)}>
            {l}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Where they came from">
        {FROM.map(([k, l]) => (
          <Chip key={k} on={from === k} onClick={() => setFrom(k)} quiet>
            {l}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-body rounded-card border border-dashed border-line-strong bg-surface-raised p-4 text-ink-muted">
          {clients.length === 0 ? "No customers yet. Everyone who books, buys or claims a Tikka shows up here." : "Nobody matches that."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
          {shown.map((c) => (
            <li key={c.key}>
              <Link href={`/app/leads/${encodeURIComponent(c.key)}`} className="flex min-h-18 items-center gap-3 px-4 py-3 active:bg-surface-sunken">
                <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-brand-soft font-bold text-brand" aria-hidden="true">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  {/* The number is who they are: two customers can share a name, never a number. */}
                  {c.phone && <span className="text-caption block font-mono text-ink-muted">{formatPhone(c.phone)}</span>}
                  <span className="text-caption block text-ink-muted">
                    {c.visits} {c.visits === 1 ? "visit" : "visits"} · {naira(c.spentKobo)}
                    {c.next ? ` · next ${relativeDay(c.next.at, at)}` : c.lastVisit ? ` · last came ${relativeDay(c.lastVisit, at)}` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {c.owedKobo > 0 && <Tag tone="bad">Owes {naira(c.owedKobo)}</Tag>}
                    {c.noShows >= 2 && <Tag tone="gold">Didn&apos;t come {c.noShows}×</Tag>}
                    {!c.phone && <Tag tone="plain">No number</Tag>}
                    {c.visits >= 5 && <Tag tone="ok">Regular</Tag>}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function initials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-raised p-3">
      <span className="text-caption text-ink-muted">{label}</span>
      <b className="text-code block text-[16px]">{value}</b>
    </div>
  );
}

function Chip({ on, onClick, quiet, children }: { on: boolean; onClick: () => void; quiet?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-pill border px-4 text-sm font-semibold whitespace-nowrap ${on ? (quiet ? "border-ink bg-surface-sunken text-ink" : "border-brand bg-brand text-on-brand") : "border-line-strong bg-surface-raised"}`}
    >
      {children}
    </button>
  );
}

export function Tag({ tone, children }: { tone: "ok" | "bad" | "gold" | "plain" | "info"; children: React.ReactNode }) {
  const cls = { ok: "bg-success-soft text-success", bad: "bg-danger-soft text-danger", gold: "bg-gold-soft text-gold-text", plain: "bg-surface-sunken text-ink-muted", info: "bg-brand-soft text-brand" }[tone];
  return <span className={`text-caption inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold ${cls}`}>{children}</span>;
}
