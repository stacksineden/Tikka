"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { addContactCardAction } from "@/app/app/contact-card-actions";
import { PERSON_MAX } from "@/lib/contact-cards";
import type { TeamMember } from "@/lib/types";

/** "Make a card for someone on your team": the team on their page is one tap away. */
export function AddContactCard({ team }: { team: TeamMember[] }) {
  const [state, action, pending] = useActionState(addContactCardAction, undefined);
  const router = useRouter();
  // Made: open it to design, once. The list stays alive in the background, so coming back to it
  // (Done in the editor) runs this effect again; the ref stops it opening the same card twice.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!state?.id || opened.current === state.id) return;
    opened.current = state.id;
    router.push(`/app/posters/cards/${state.id}`);
  }, [state?.id, router]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  return (
    <form action={action} className="grid gap-3 rounded-card border border-dashed border-line-strong bg-surface-raised p-4">
      <div>
        <h2 className="text-label">Make a card for someone on your team</h2>
        <p className="text-caption mt-0.5 text-ink-muted">Their name and role go on the back. Same QR to your page.</p>
      </div>
      {team.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {team.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setName(m.name);
                setRole(m.role ?? "");
              }}
              className="text-caption min-h-9 rounded-pill bg-surface-sunken px-3 text-ink"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-caption font-semibold">Name</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={PERSON_MAX} placeholder="e.g. Ada Nwosu" className="input" aria-invalid={!!state?.error} />
        </label>
        <label className="grid gap-1">
          <span className="text-caption font-semibold">Role (optional)</span>
          <input name="role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={PERSON_MAX} placeholder="e.g. Lash artist" className="input" />
        </label>
      </div>
      {state?.error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn min-h-11 justify-self-start px-4" disabled={pending}>
        <Plus />
        Make their card
      </button>
    </form>
  );
}
