"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A form's submit button that shows it's working: "Saving…" (and can't be pressed again) while the
 * server action runs, then "Saved ✓" for a moment. Put it inside the <form>.
 */
export function SaveButton({ children, className, pressed, done = "Saved" }: { children: React.ReactNode; className: string; pressed?: boolean; done?: string }) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1800);
      was.current = false;
      return () => clearTimeout(t);
    }
    was.current = pending;
  }, [pending]);
  return (
    <button type="submit" disabled={pending} aria-pressed={pressed} aria-busy={pending || undefined} className={className}>
      {pending ? (
        "Saving…"
      ) : saved ? (
        <>
          <Check size={16} aria-hidden="true" />
          {done}
        </>
      ) : (
        children
      )}
    </button>
  );
}
