"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeContactCardAction } from "@/app/app/contact-card-actions";

/** "Remove" under a card on the list. Asks first; printed cards keep opening the page. */
export function RemoveCard({ cardId }: { cardId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirm) {
    return (
      <button type="button" className="btn btn-ghost min-h-11 px-3 text-label text-danger" onClick={() => setConfirm(true)}>
        <Trash2 />
        Remove
      </button>
    );
  }
  return (
    <div className="col-span-full grid w-full basis-full gap-2 rounded-md border border-line p-3">
      <p className="text-caption">Remove this card? Cards you&apos;ve already printed keep opening your page.</p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary min-h-11 flex-1 px-3 text-label" onClick={() => setConfirm(false)}>
          Keep it
        </button>
        <button
          type="button"
          className="btn min-h-11 flex-1 bg-danger px-3 text-label text-on-danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await removeContactCardAction(cardId);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          Remove
        </button>
      </div>
      {error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
