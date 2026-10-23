"use client";

import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TIER_LABEL } from "@/components/tikka/RarityBadge";
import type { NewClaim } from "@/lib/data";

const POLL_MS = 10_000;
const KEY = "tk_prompt_dismissed";

function dismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function dismiss(token: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...dismissed(), token].slice(-20)));
  } catch {}
}

/**
 * "Adaeze just claimed a Rare Tikka. Message Adaeze now?" (PRD B8). Polls while the tab is
 * visible; Realtime on claim_completed replaces this in M1. Owners only.
 */
export function ClaimPrompt({ since: from }: { since: string }) {
  const [claim, setClaim] = useState<NewClaim | null>(null);
  // From when the server rendered the page, so a claim made while it loads isn't missed.
  const since = useRef(from);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/claims/new?since=${encodeURIComponent(since.current)}`, { cache: "no-store" });
        if (!r.ok || !live) return;
        const list = ((await r.json()) as NewClaim[]).filter((c) => !dismissed().includes(c.token));
        if (list[0]) {
          since.current = list[0].at;
          setClaim(list[0]);
        }
      } catch {}
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (!claim) return null;
  const tier = TIER_LABEL[claim.tier];
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-start gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-raised lg:bottom-6 lg:right-6 lg:left-auto lg:mx-0"
    >
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">
          {claim.firstName} just claimed {/^[aeiou]/i.test(tier) ? "an" : "a"} {tier} Tikka.
        </p>
        <p className="text-caption text-ink-muted">{claim.reward}</p>
        {claim.whatsapp ? (
          <a href={claim.whatsapp} target="_blank" rel="noopener noreferrer" className="btn mt-3 min-h-11 px-4 text-label">
            <MessageCircle />
            Message {claim.firstName} now
          </a>
        ) : (
          <Link href="/app/leads" className="btn mt-3 min-h-11 px-4 text-label">
            <MessageCircle />
            Message {claim.firstName} now
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          dismiss(claim.token);
          setClaim(null);
        }}
        aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-md text-ink-muted">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
