"use server";

// NEW DIRECTION: Booking settings in one place (hours, how many at once, how soon and how far
// ahead, where you work and the travel fee, the deposit, rules and questions). Demo store only:
// real accounts are refused, so nothing here touches Supabase.

import { revalidatePath } from "next/cache";
import { getBookingSetup, saveBookingSettings, saveDemoDeposit } from "@/lib/bookings-data";
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
  | { kind: "questions"; serviceId: string; questions: string[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveBookingPatch(p: BookingPatch): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user || isDbId(user.id)) return { ok: false, error: "This works with the demo for now." };
  const [b, setup] = await Promise.all([getBusiness(user), getBookingSetup(user)]);
  if (!b || !setup) return { ok: false, error: "Set up your page first." };
  const keep = { enabled: setup.enabled, capacity: setup.capacity, noticeMinutes: setup.noticeMinutes, aheadDays: setup.aheadDays, minutes: setup.minutes };

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
    case "deposit":
      await saveDemoDeposit(
        user,
        p.mode === "off"
          ? { mode: "off", counts: p.counts }
          : p.mode === "fixed"
            ? { mode: "fixed", fixedKobo: Math.max(100_000, Math.min(100_000_000, Math.round((p.amount ?? 0) * 100))), counts: p.counts }
            : { mode: "percent", percent: Math.max(10, Math.min(100, Math.round(p.percent ?? 30))), counts: p.counts },
      );
      break;
    case "rules":
      await saveBusiness(user, { ...b, bookingRules: p.rules.map((r) => r.trim().slice(0, 240)).filter(Boolean).slice(0, 10) });
      break;
    case "questions": {
      const questions = p.questions.map((q) => q.trim().slice(0, 80)).filter(Boolean).slice(0, 3);
      await saveBusiness(user, { ...b, services: b.services.map((s) => (s.id === p.serviceId ? { ...s, questions: questions.length ? questions : undefined } : s)) });
      break;
    }
  }
  revalidatePath("/app", "layout");
  revalidatePath(`/${b.slug}`);
  return { ok: true };
}
