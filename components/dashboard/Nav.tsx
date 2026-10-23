"use client";

import {
  Globe,
  QrCode,
  ShieldCheck,
  ChevronRight,
  Wallet,
  House,
  Layers,
  LogOut,
  Menu,
  MessageSquareText,
  ScanLine,
  Settings,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";

type Item = { href: string; label: string; Icon: LucideIcon };

export const NAV: Item[] = [
  { href: "/app", label: "Home", Icon: House },
  { href: "/app/drops", label: "Drops", Icon: Layers },
  { href: "/app/leads", label: "Leads", Icon: Users },
  { href: "/app/reviews", label: "Reviews", Icon: MessageSquareText },
  { href: "/app/page", label: "Your page", Icon: Globe },
  { href: "/app/posters", label: "Posters", Icon: QrCode },
  { href: "/app/redeem", label: "Redeem", Icon: ScanLine },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];

/** What the account areas show. Comes from the server; null while it streams in. */
export interface AccountSummary {
  businessName: string | null;
  initials: string;
  logoUrl?: string;
  brandColor?: string;
  onBrandColor?: string;
  email: string;
  rating?: number;
  reviewCount?: number;
  /** Drops the business can publish without paying (never called vouchers in the UI). */
  dropsReady?: number;
  staff?: boolean;
  /** DEMO: profiles.is_admin; shows the Admin link. */
  admin?: boolean;
}

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path.startsWith(href);
}

export function BusinessAvatar({ account, size = 36 }: { account: AccountSummary | null; size?: number }) {
  const branded = account?.businessName && account.brandColor;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-pill font-extrabold ${branded ? "" : "bg-brand-soft text-brand"}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        ...(branded ? { background: account.brandColor, color: account.onBrandColor } : {}),
      }}
      aria-hidden="true"
    >
      {account?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.logoUrl} alt="" className="size-full rounded-pill object-cover" />
      ) : (
        (account?.initials ?? "")
      )}
    </span>
  );
}

/* ------------------------------------------------------------ desktop */

export function SideNav({ staff = false, admin = false }: { staff?: boolean; admin?: boolean }) {
  return <SideNavList path={usePathname()} staff={staff} admin={admin} />;
}

/** The sidebar links for a given path. With path="" it's the plain version shown while the page loads.
 *  Staff only ever see Redeem. */
export function SideNavList({ path, staff = false, admin = false }: { path: string; staff?: boolean; admin?: boolean }) {
  const links = NAV.filter((n) => !staff || n.href === "/app/redeem");
  return (
    <nav aria-label="Dashboard" className="grid gap-0.5">
      {(admin && !staff ? [...links, { href: "/admin", label: "Admin", Icon: ShieldCheck }] : links).map(({ href, label, Icon }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`text-body flex h-10 items-center gap-3 rounded-md px-3 font-medium transition-colors ${
              active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------- mobile */

/** Top bar on phones: which business you're in, and a quick way to the More sheet. */
export function MobileHeader({ account, staff = false }: { account: AccountSummary | null; staff?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface-raised px-4 lg:hidden">
      <Link href={staff ? "/app/redeem" : "/app"} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label={staff ? "Redeem" : "Dashboard home"}>
        <BusinessAvatar account={account} size={32} />
        <span className="text-label min-w-0 truncate text-[15px] text-ink">
          {account ? (account.businessName ?? "Your business") : ""}
        </span>
      </Link>
      {staff && (
        <form action={signOut}>
          <button type="submit" className="text-label inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-ink-muted">
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </form>
      )}
    </header>
  );
}

const MORE_PATHS = ["/app/reviews", "/app/page", "/app/posters", "/app/settings"];

/** Bottom tab bar on phones. Redeem sits in the middle: it's what gets used at the counter. */
export function BottomNav({ account }: { account: AccountSummary | null }) {
  return <BottomBar account={account} path={usePathname()} />;
}

/** The phone tab bar for a given path. With path="" it's the plain version shown while the page loads. */
export function BottomBar({ account, path }: { account: AccountSummary | null; path: string }) {
  const [open, setOpen] = useState(false);
  const moreActive = MORE_PATHS.some((p) => path.startsWith(p));
  const tabs = ["/app", "/app/drops", "/app/redeem", "/app/leads"].map((href) => NAV.find((n) => n.href === href)!);

  return (
    <>
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {tabs.map(({ href, label, Icon }) => {
            const active = isActive(path, href);
            const redeem = href === "/app/redeem";
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                    active ? "text-brand" : "text-ink-muted"
                  }`}
                >
                  {redeem ? (
                    <span className="grid size-10 place-items-center rounded-pill bg-brand text-on-brand shadow-raised">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="grid size-10 place-items-center">
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                  )}
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                moreActive ? "text-brand" : "text-ink-muted"
              }`}
            >
              <span className="grid size-10 place-items-center">
                <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={open} onClose={() => setOpen(false)} account={account} path={path} />
    </>
  );
}

function MoreSheet({ open, onClose, account, path }: { open: boolean; onClose: () => void; account: AccountSummary | null; path: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Close after navigating to another page.
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current !== path) onClose();
    lastPath.current = path;
  }, [path, onClose]);

  const rows: { href: string; label: string; Icon: LucideIcon; meta?: string }[] = [
    {
      href: "/app/reviews",
      label: "Reviews",
      Icon: MessageSquareText,
      meta: account?.rating ? `${account.rating} · ${account.reviewCount}` : undefined,
    },
    {
      href: "/app/settings/payments",
      label: "Payments",
      Icon: Wallet,
      meta: account?.dropsReady ? `${account.dropsReady} drop${account.dropsReady === 1 ? "" : "s"} ready to publish` : "Drop payments",
    },
    { href: "/app/page", label: "Your page", Icon: Globe, meta: "Your free website" },
    { href: "/app/posters", label: "Posters", Icon: QrCode, meta: "Your QR for the counter" },
    { href: "/app/settings/team", label: "Team", Icon: UsersRound },
    { href: "/app/settings", label: "Settings", Icon: Settings, meta: "Card and profile" },
    ...(account?.admin ? [{ href: "/admin", label: "Admin", Icon: ShieldCheck, meta: "Tikka team only" }] : []),
  ];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // tap on the backdrop
      }}
      aria-label="More"
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 lg:hidden"
    >
      <div className="rounded-t-[24px] bg-surface-raised px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 text-ink">
        <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line-strong/40" aria-hidden="true" />
        <div className="flex items-center gap-3 px-1 pb-4">
          <BusinessAvatar account={account} size={44} />
          <div className="min-w-0 flex-1">
            <div className="text-title truncate text-[17px] leading-6">{account?.businessName ?? "Your business"}</div>
            <div className="text-caption truncate text-ink-muted">{account?.email}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-ink-muted"
            aria-label="Close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <ul className="overflow-hidden rounded-card border border-line">
          {rows.map(({ href, label, Icon, meta }) => {
            const active = path === href || (href !== "/app/settings" && path.startsWith(href));
            return (
              <li key={href} className="border-b border-line last:border-b-0">
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 px-4 ${active ? "bg-brand-soft" : "active:bg-surface-sunken"}`}
                >
                  <Icon size={20} strokeWidth={1.75} className={active ? "text-brand" : "text-ink-muted"} aria-hidden="true" />
                  <span className="text-body flex-1 font-semibold">{label}</span>
                  {meta && <span className="text-caption text-ink-muted">{meta}</span>}
                  <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>

        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="text-body flex min-h-14 w-full items-center gap-3 rounded-card border border-line px-4 font-semibold text-danger active:bg-surface-sunken"
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </dialog>
  );
}
