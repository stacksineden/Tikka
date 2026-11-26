import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RedeemScreen } from "@/components/redeem/RedeemScreen";
import { BookingsBoard } from "@/components/bookings/BookingsBoard";
import { todayKey, watInstant } from "@/lib/bookings";
import { getBookings, getBookingSetup } from "@/lib/bookings-data";
import { getBusiness, memberBusinessId } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { newExperience } from "@/lib/experience";

export const metadata: Metadata = { title: "Redeem" };

async function Redeem() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/app/redeem");
  const ownerId = await memberBusinessId(user);
  const b = ownerId ? await getBusiness({ id: ownerId }) : null;
  if (!b) {
    if (user.role === "owner") redirect("/app/setup");
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-heading">Redeem</h1>
        <p className="text-body-lg mt-3 text-ink-muted">You&apos;re not on a team any more. Ask the business owner to invite you again.</p>
      </div>
    );
  }
  return (
    <>
      <RedeemScreen businessName={b.name} prefix={b.codePrefix} isOwner={user.role === "owner"} />
      {/* Staff can't open Today or Calendar, so they mark who came in here. The owner of a business
          from the new setup does that on Today, so they don't get the list twice. */}
      {!(user.role === "owner" && newExperience(b)) && (
        <Suspense>
          <TodayAtCounter user={user} businessName={b.name} />
        </Suspense>
      )}
    </>
  );
}

/** Today's bookings at the counter (docs/BOOKINGS.md journey 10): Arrived and No-show, never numbers. */
async function TodayAtCounter({ user, businessName }: { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>; businessName: string }) {
  const setup = await getBookingSetup(user);
  if (!setup?.setUp) return null;
  await connection();
  const day = todayKey(new Date());
  const list = await getBookings(user, new Date(watInstant(day, 0)), new Date(watInstant(day, 24 * 60)));
  if (!list.some((x) => x.status !== "cancelled")) return null;
  return (
    <div className="mx-auto grid max-w-md gap-2 px-4 pb-10">
      {user.role === "staff" && <p className="text-caption text-ink-muted">Today&apos;s bookings: tap Arrived when someone comes in, or No-show if they don&apos;t.</p>}
      <BookingsBoard
        bookings={list.filter((x) => x.status !== "cancelled").map((x) => ({ ...x, phone: undefined }))}
        blocks={[]}
        services={[]}
        base={{ capacity: setup.capacity, noticeMinutes: setup.noticeMinutes, aheadDays: setup.aheadDays }}
        businessName={businessName}
        staff
        todayOnly
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-md" />}>
      <Redeem />
    </Suspense>
  );
}
