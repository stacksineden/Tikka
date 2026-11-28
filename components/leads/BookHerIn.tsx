"use client";

import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addBookingAction } from "@/app/app/bookings-actions";
import { ChoicePicker } from "@/components/bookings/ChoicePicker";
import { Sheet } from "@/components/bookings/Sheet";
import { TimePicker } from "@/components/bookings/TimePicker";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { needsChoice, priceBooking, type BookingChoice } from "@/lib/booking-price";
import { lengthLabel, PROBLEM_TEXT, whenLabel, type BookingRules } from "@/lib/bookings";
import { priceText } from "@/lib/page";
import type { ServiceItem } from "@/lib/types";

/**
 * "Book her in" (docs/BOOKINGS.md journey 11a): the claimer said on WhatsApp when they'll come;
 * the owner takes that time in the calendar, connected to their Tikka. Name and number come from
 * the Tikka on the server. Then "Tell {name} on WhatsApp" from the owner's own phone.
 */
export function BookHerIn({
  claimId,
  name,
  phone,
  businessName,
  services,
  rules,
}: {
  claimId: string;
  name: string;
  phone?: string;
  businessName: string;
  services: { id: string; name: string; minutes: number; item?: ServiceItem }[];
  rules: BookingRules;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [choice, setChoice] = useState<BookingChoice>({});
  const [at, setAt] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const svc = services.find((s) => s.id === serviceId);
  if (!services.length) return null;
  // Options, per hour, per item, per person: which one and how many, priced on the server.
  const asks = svc?.item && needsChoice(svc.item) ? svc.item : null;
  const minutes = asks ? priceBooking(asks, choice, 0, undefined).minutes : (svc?.minutes ?? 60);

  function book() {
    if (!at || !svc) return;
    setError("");
    start(async () => {
      const r = await addBookingAction({ claimId, serviceId, startsAt: at, name: "", phone: "", force, ...(asks ? { choice } : {}) });
      if (r.kind !== "booked") return setError(PROBLEM_TEXT[r.kind] ?? "That didn't work. Try again.");
      setDone(at);
      router.refresh();
    });
  }

  const first = name.split(" ")[0];
  return (
    <>
      <button type="button" className="btn btn-secondary min-h-11" onClick={() => (setOpen(true), setDone(null), setAt(null), setError(""))}>
        <CalendarPlus size={18} aria-hidden="true" />
        Book {first} in
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={done ? `${first} is booked` : `Book ${first} in`} sub={done ? `${svc?.name} · ${whenLabel(done)}` : "The time they told you on WhatsApp. It's taken in your calendar straight away."}>
        {done ? (
          <div className="mt-4 grid gap-3">
            {phone && (
              <a
                className="btn min-h-12"
                target="_blank"
                rel="noopener noreferrer"
                href={whatsappLink(phone, `Hi ${first}, you're booked at ${businessName} for ${svc?.name} on ${whenLabel(done)}. Bring your Tikka. See you then!`)}
              >
                <ActionIcon kind="whatsapp" />
                Tell {first} on WhatsApp
              </a>
            )}
            <button type="button" className="btn btn-secondary min-h-12" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-label">Service</span>
              <select className="input" value={serviceId} onChange={(e) => (setServiceId(e.target.value), setChoice({}), setAt(null))}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.item && needsChoice(s.item) ? priceText(s.item) : lengthLabel(s.minutes)}
                  </option>
                ))}
              </select>
            </label>
            {asks && <ChoicePicker service={asks} choice={choice} onChange={setChoice} />}
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0" checked={force} onChange={(e) => (setForce(e.target.checked), setAt(null))} />
              <span className="text-body">
                Fit them in anyway
                <span className="text-caption block text-ink-muted">Shows every time, even full or closed ones.</span>
              </span>
            </label>
            {svc && <TimePicker key={`${serviceId}-${force}`} rules={rules} minutes={minutes} force={force} onPick={setAt} />}
            <button type="button" className="btn min-h-12" disabled={pending || !at} onClick={book}>
              {pending ? "Booking…" : at ? `Book ${whenLabel(at)}` : "Pick a time"}
            </button>
            <p role="alert" className="text-caption min-h-5 text-danger">
              {error}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
