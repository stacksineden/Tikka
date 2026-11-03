"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Phones: the header's links behind one Menu button, as a panel under the header. */
export function SiteMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Menu"}
        className="grid size-11 place-items-center rounded-md text-on-night hover:bg-night-raised"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-night/60" aria-hidden="true" onClick={() => setOpen(false)} />
          <nav
            id="site-menu"
            aria-label="Main"
            className="absolute inset-x-3 top-16 z-50 rounded-card border border-on-night-muted/20 bg-night-raised p-2 shadow-raised"
          >
            <ul className="grid">
              {links.map((n) => (
                <li key={n.href}>
                  <a
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="text-body flex min-h-12 items-center rounded-md px-4 font-semibold text-on-night active:bg-night"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
              <li className="mt-1 border-t border-on-night-muted/20 pt-1">
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="text-body flex min-h-12 items-center rounded-md px-4 font-semibold text-on-night active:bg-night"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
