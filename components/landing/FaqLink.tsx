"use client";

/** Jumps to a FAQ and opens it (the answers are <details>). */
export function FaqLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${id}`}
      className="text-label inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
      onClick={() => {
        const el = document.getElementById(id);
        if (el instanceof HTMLDetailsElement) el.open = true;
      }}
    >
      {children}
    </a>
  );
}
