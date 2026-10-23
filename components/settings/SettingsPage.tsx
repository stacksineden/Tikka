import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** Frame for a Settings sub-page: a back link (thumb-friendly on phones), title and intro. */
export function SettingsPage({ title, intro, children, wide = false }: { title: string; intro?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto grid grid-cols-1 gap-5 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-28 lg:pt-8 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <div>
        <Link href="/app/settings" className="text-label -ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-brand">
          <ChevronLeft size={18} aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-heading mt-1">{title}</h1>
        {intro && <p className="text-body mt-1 text-ink-muted">{intro}</p>}
      </div>
      {children}
    </div>
  );
}
