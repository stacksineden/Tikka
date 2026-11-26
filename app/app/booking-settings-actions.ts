"use server";

// Booking settings in one place (hours, how many at once, how soon and how far ahead, where you
// work and the travel fee, the deposit, rules and questions). Real businesses save to Supabase
// (save_booking_settings(), save_deposit_settings(), the business and its services); the demo
// business keeps its demo store. Owners only; the database checks again.

import { revalidatePath } from "next/cache";
import { getBookingSetup, removeWaitlist, saveBookingSettings, saveDemoDeposit } from "@/lib/bookings-data";
import { dbSaveDepositSettings } from "@/lib/bookings-db";
import { MAX_GAP } from "@/lib/bookings";
import { getBusiness, isDbId, saveBusiness } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";
import type { OpeningHours, TravelReach, WorkPlace } from "@/lib/types";

export type BookingPatch =
  | { kind: "hours"; hours: OpeningHours }
  | { kind: "capacity"; capacity: number }
  | { kind: "timing"; noticeMinutes: number; aheadDays: number }
  | { kind: "open"; enabled: boolean }
  | { kind: "place"; workPlace: WorkPlace; travelFee: number; travelReach: TravelReach }
  | { kind: "deposit"; mode: "percent" | "fixed" | "off"; percent?: number; amount?: number; counts: boolean }
  | { kind: "rules"; rules: string[] }
  | { kind: "questions"; serviceId: string; questions: string[] }
  | { kind: "gap"; gapMinutes: number; homeGapMinutes: number; services: { id: string; gapMinutes: number | null }[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveBookingPatch(p: BookingPatch): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner changes booking settings." };
  const [b, setup] = await Promise.all([getBusiness(user), getBookingSetup(user)]);
  if (!b || !setup) return { ok: false, error: "Set up your page first." };
  const real = isDbId(b.id);
  const keep = { enabled: setup.enabled, capacity: setup.capacity, noticeMinutes: setup.noticeMinutes, aheadDays: setup.aheadDays, minutes: setup.minutes };
  try {

  switch (p.kind) {
    case "hours": {
      for (const d of Object.values(p.hours)) if (d.open && (!TIME.test(d.from) || !TIME.test(d.to) || d.from >= d.to)) return { ok: false, error: "Closing time must be after opening time." };
      if (!Object.values(p.hours).some((d) => d.open)) return { ok: false, error: "Open at least one day." };
      await saveBusiness(user, { ...b, hours: p.hours });
      break;
    }
    case "capacity":
      await saveBookingSettings(user, { ...keep, capacity: Math.max(1, Math.min(8, Math.round(p.capacity))) });
      break;
    case "timing":
      await saveBookingSettings(user, { ...keep, noticeMinutes: Math.max(0, Math.min(2880, Math.round(p.noticeMinutes))), aheadDays: Math.max(7, Math.min(186, Math.round(p.aheadDays))) });
      break;
    case "open":
      await saveBookingSettings(user, { ...keep, enabled: p.enabled });
      break;
    case "place":
      await saveBusiness(user, {
        ...b,
        workPlace: p.workPlace,
        serveMode: p.workPlace === "home" ? "come_to_you" : "in_store",
        travelFee: p.workPlace === "shop" ? undefined : Math.max(0, Math.min(1_000_000, Math.round(p.travelFee))),
        travelReach: p.workPlace === "shop" ? undefined : p.travelReach,
      });
      break;
    case "deposit": {
      const fixedKobo = Math.max(100_000, Math.min(100_000_000, Math.round((p.amount ?? 0) * 100)));
      const percent = Math.max(10, Math.min(100, Math.round(p.percent ?? 30)));
      if (real) {
        // Deposits live on the booking settings: make them first if this is the owner's first change.
        if (!setup.setUp) await saveBookingSettings(user, keep);
        const kind = await dbSaveDepositSettings(b.id, {
          mode: p.mode,
          percent: p.mode === "percent" ? percent : null,
          fixedKobo: p.mode === "fixed" ? fixedKobo : null,
          counts: p.counts,
          // Each service's own deposit rule stays as it is.
          services: {},
        });
        if (kind !== "saved") return { ok: false, error: kind === "bad_percent" ? "Pick a percentage between 10% and 100%." : "Couldn't save the deposit. Try again." };
        break;
      }
      await saveDemoDeposit(
        user,
        p.mode === "off" ? { mode: "off", counts: p.counts } : p.mode === "fixed" ? { mode: "fixed", fixedKobo, counts: p.counts } : { mode: "percent", percent, counts: p.counts },
      );
      break;
    }
    case "rules":
      await saveBusiness(user, { ...b, bookingRules: p.rules.map((r) => r.trim().slice(0, 240)).filter(Boolean).slice(0, 10) });
      break;
    case "gap": {
      const clamp = (n: number) => Math.max(0, Math.min(MAX_GAP, Math.round(Number(n) || 0)));
      const own = new Map(p.services.map((x) => [x.id, x.gapMinutes]));
      await saveBusiness(user, {
        ...b,
        gapMinutes: clamp(p.gapMinutes) || undefined,
        homeGapMinutes: b.workPlace && b.workPlace !== "shop" ? clamp(p.homeGapMinutes) || undefined : undefined,
        services: b.services.map((s) => {
          if (!s.id || !own.has(s.id)) return s;
          const g = own.get(s.id);
          return { ...s, gapMinutes: g == null ? undefined : clamp(g) };
        }),
      });
      break;
    }
    case "questions": {
      const questions = p.questions.map((q) => q.trim().slice(0, 80)).filter(Boolean).slice(0, 3);
      await saveBusiness(user, { ...b, services: b.services.map((s) => (s.id === p.serviceId ? { ...s, questions: questions.length ? questions : undefined } : s)) });
      break;
    }
  }
  } catch {
    return { ok: false, error: "That didn't save. Try again." };
  }
  revalidatePath("/app", "layout");
  revalidatePath(`/${b.slug}`);
  return { ok: true };
}

/** NEW DIRECTION: take someone off the waitlist (told, or booked). */
export async function removeWaitlistAction(id: string) {
  const user = await getOwnerUser();
  if (!user) return;
  await removeWaitlist(user, id);
  revalidatePath("/app/bookings");
}
