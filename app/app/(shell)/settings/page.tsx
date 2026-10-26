import type { Metadata } from "next";
import { ChevronRight, Clock, Film, Globe, Images, Wallet, ListChecks, Palette, Phone, Sparkles, Store, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SoloCard } from "@/components/tikka/SoloCard";
import { faceFromBusiness } from "@/components/tikka/TikkaCard";
import { getBusiness, getVouchers } from "@/lib/data";
import { dropsReady } from "@/lib/vouchers";
import { place } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import { actionMeta } from "@/lib/setup";

export const metadata: Metadata = { title: "Settings" };

async function Hub() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const [b, vouchers] = await Promise.all([getBusiness(user), getVouchers(user)]);
  if (!b) redirect("/app/setup");

  type Row = { href: string; label: string; meta: string; Icon: LucideIcon };
  const buttons = b.actions.map((a) => actionMeta(a.kind).label).join(", ");
  const card: Row[] = [
    { href: "/app/settings/card", label: "Card look", meta: "Logo, colour and background", Icon: Palette },
    { href: "/app/settings/profile#buttons", label: "Buttons and contact", meta: buttons || "WhatsApp, call, address, booking link", Icon: Phone },
    { href: "/app/settings/profile#services", label: "Services and prices", meta: b.services.length ? `${b.services.length} listed` : "Not added yet", Icon: ListChecks },
    { href: "/app/settings/profile#basics", label: "Name, tagline and location", meta: `${b.name} · ${place(b.area, b.city)}`, Icon: Store },
    { href: "/app/settings/profile#about", label: "About and opening hours", meta: b.about || b.hours ? "Added" : "Not added yet", Icon: Clock },
    { href: "/app/settings/profile#photos", label: "Portfolio photos", meta: b.portfolio.length ? `${b.portfolio.length} of 12` : "Not added yet", Icon: Images },
    { href: "/app/settings/profile#video", label: "Video", meta: b.hasVideo ? "Added" : "Not added yet", Icon: Film },
    { href: "/app/settings/profile#codes", label: "Page address", meta: `usetikka.com/${b.slug}`, Icon: Globe },
  ];
  const account: Row[] = [
    { href: "/app/settings/team", label: "Team", meta: "Staff who redeem codes at the counter", Icon: UsersRound },
    { href: "/app/settings/payments", label: "Payments", meta: ((n) => (n ? `${n} drop${n === 1 ? "" : "s"} ready to publish · season packs` : "Season packs and drop payments"))(dropsReady(vouchers, new Date())), Icon: Wallet },
    { href: "/app/settings/account", label: "Account", meta: "WhatsApp alerts, daily summary, sign-in", Icon: UserRound },
  ];

  const group = (title: string, rows: Row[]) => (
    <section className="grid gap-2">
      <h2 className="text-label px-1 text-ink-muted">{title}</h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface-raised">
        {rows.map(({ href, label, meta, Icon }) => (
          <li key={href} className="border-b border-line last:border-b-0">
            <Link href={href} className="flex min-h-16 items-center gap-4 px-4 py-3 active:bg-surface-sunken lg:hover:bg-surface-sunken">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-body block font-semibold">{label}</span>
                <span className="text-caption block truncate text-ink-muted">{meta}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <h1 className="text-heading">Settings</h1>

      <Link href="/app/settings/card" className="stage flex items-center gap-4 overflow-hidden rounded-card bg-night p-4 pr-5 text-on-night">
        <SoloCard zoom={0.36} face={faceFromBusiness(b)} total={500} label={`${b.name}'s Tikka card`} />
        <div className="min-w-0 flex-1">
          <div className="text-title truncate">{b.name}</div>
          <div className="text-caption mt-0.5 text-on-night-muted">
            {b.category} · {place(b.area, b.city)}
          </div>
          <div className="text-label mt-3 inline-flex items-center gap-1 text-on-night">
            Edit your card
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        </div>
      </Link>

      {group("Your card", card)}
      {group("Your account", account)}
      {group("Help", [{ href: "/studio", label: "Get help from Tikka Studio", meta: "We build websites, WhatsApp follow-up and ads, and run drops for you", Icon: Sparkles }])}
    </div>
  );
}

export default function SettingsHub() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-3xl" />}>
      <Hub />
    </Suspense>
  );
}
