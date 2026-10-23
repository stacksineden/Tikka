import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { BottomBar, BottomNav, BusinessAvatar, MobileHeader, SideNav, SideNavList, type AccountSummary } from "@/components/dashboard/Nav";
import { Logo } from "@/components/site/Logo";
import { getBusiness, getVouchers } from "@/lib/data";
import { dropsReady } from "@/lib/vouchers";
import { getSessionUser } from "@/lib/session";

async function getAccount(): Promise<AccountSummary | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const [b, vouchers] = await Promise.all([getBusiness(user), user.role === "owner" ? getVouchers(user) : []]);
  const staff = user.role === "staff";
  if (!b) return { businessName: null, initials: (user.name[0] ?? "T").toUpperCase(), email: user.email, staff };
  return {
    businessName: b.name,
    initials: b.initials,
    logoUrl: b.logoUrl,
    brandColor: b.brandColor,
    onBrandColor: b.onBrandColor,
    email: user.email,
    rating: b.rating,
    reviewCount: b.reviewCount,
    dropsReady: dropsReady(vouchers, new Date()),
    admin: !!user.isAdmin,
    staff,
  };
}

async function SideAccount() {
  const account = await getAccount();
  return (
    <div className="flex items-center gap-3 rounded-md p-2">
      <BusinessAvatar account={account} />
      <div className="min-w-0 flex-1">
        <div className="text-label truncate text-ink">{account?.businessName ?? "Your business"}</div>
        <div className="text-caption truncate text-ink-muted">{account?.email}</div>
      </div>
    </div>
  );
}

async function MobileChrome() {
  const account = await getAccount();
  // Staff only use Redeem: no tab bar, just who they're redeeming for and sign out.
  if (account?.staff) return <MobileHeader account={account} staff />;
  return (
    <>
      <MobileHeader account={account} />
      <BottomNav account={account} />
    </>
  );
}

async function SideNavForRole() {
  const user = await getSessionUser();
  return <SideNav staff={user?.role === "staff"} admin={!!user?.isAdmin} />;
}

export default function ShellLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-raised px-3 py-5 lg:flex">
        <Link href="/app" className="px-3" aria-label="Tikka dashboard home">
          <Logo height={26} priority />
        </Link>
        <div className="mt-8 flex-1">
          <Suspense fallback={<SideNavList path="" />}>
            <SideNavForRole />
          </Suspense>
        </div>
        <div className="border-t border-line pt-3">
          <Suspense fallback={<div className="h-[53px]" />}>
            <SideAccount />
          </Suspense>
          <form action={signOut}>
            <button type="submit" className="text-label mt-1 h-10 w-full rounded-md px-3 text-left text-ink-muted hover:bg-surface-sunken hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Phones: the account-aware top bar and tab bar stream in; until then they render without the business. */}
      <Suspense
        fallback={
          <>
            <MobileHeader account={null} />
            <BottomBar account={null} path="" />
          </>
        }
      >
        <MobileChrome />
      </Suspense>

      <div className="min-w-0 pb-[calc(88px+env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-1 lg:pb-0">{children}</div>
    </div>
  );
}
