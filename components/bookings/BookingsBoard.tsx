"use client";

import { Ban, CalendarPlus, Check, Clock, MoveRight, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addBookingAction,
  blockTimeAction,
  cancelBookingAction,
  markBookingAction,
  moveBookingAction,
  removeBlockAction,
} from "@/app/app/bookings-actions";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { naira } from "@/lib/format";
import { normalizeNgPhone } from "@/lib/setup";
import { slotLabel, whatsappLink } from "@/lib/booking";
import {
  byDay,
  cancelledMessage,
  canMark,
  dayLabel,
  hiMessage,
  gapLabel,
  lengthLabel,
  movedMessage,
  needsMarking,
  PROBLEM_TEXT,
  timeLabel,
  todayKey,
  watInstant,
  watParts,
  whenLabel,
  type Booking,
  type BookingBlock,
  type BookingRules,
} from "@/lib/bookings";
import { Sheet } from "./Sheet";
import { TimePicker } from "./TimePicker";

export interface BoardService {
  id: string;
  name: string;
  minutes: number;
}

const SOURCE: Record<Booking["source"], string> = { page: "Booked on your page", owner: "Booked by you", tikka: "From a Tikka" };

/**
 * The owner's bookings (docs/BOOKINGS.md journeys 5–10): "Did they come?", Today, Coming up and
 * Past, with Move, Cancel, WhatsApp, Arrived and No-show; Add a booking and Block a time. Staff
 * get only today's bookings with Arrived and No-show (`staff`), never numbers.
 */
export function BookingsBoard({
  bookings,
  blocks,
  services,
  base,
  businessName,
  staff = false,
  todayOnly = false,
  gaps = {},
}: {
  /** NEW DIRECTION: each booking's gap after it (clean-up, travel), by booking id. */
  gaps?: Record<string, number>;
  bookings: Booking[];
  blocks: BookingBlock[];
  services: BoardService[];
  base: Omit<BookingRules, "busy" | "blocked">;
  businessName: string;
  staff?: boolean;
  todayOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<null | { kind: "add" } | { kind: "block" } | { kind: "move"; b: Booking } | { kind: "cancel"; b: Booking } | { kind: "tell"; title: string; href: string | null; note?: string }>(null);
  const now = new Date();
  const today = todayKey(now);

  const rulesFor = (ignore?: string): BookingRules => ({
    ...base,
    busy: bookings
      .filter((b) => b.status !== "cancelled" && b.id !== ignore)
      .map((b) => [b.startsAt, gaps[b.id] ? new Date(new Date(b.endsAt).getTime() + gaps[b.id] * 60_000).toISOString() : b.endsAt]),
    blocked: blocks.map((k) => [k.startsAt, k.endsAt]),
  });

  const live = bookings.filter((b) => b.status !== "cancelled");
  const marking = staff ? [] : live.filter((b) => needsMarking(b, now) && watParts(b.startsAt).day < today);
  const todays = bookings.filter((b) => watParts(b.startsAt).day === today);
  const ahead = byDay(live.filter((b) => watParts(b.startsAt).day > today && b.status === "booked"));
  const past = bookings
    .filter((b) => watParts(b.startsAt).day < today && !(b.status === "booked" && needsMarking(b, now)))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  function act(fn: () => Promise<{ kind: string }>, ok: string, after?: () => void) {
    setError("");
    start(async () => {
      const r = await fn();
      if (r.kind !== ok) {
        setError(PROBLEM_TEXT[r.kind] ?? "That didn't work. Try again.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function row(b: Booking) {
    const cancelled = b.status === "cancelled";
    return (
      <li key={b.id} className={`grid gap-2 px-4 py-3 ${cancelled ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-3">
          <span className="w-16 shrink-0 font-mono text-[15px] font-semibold tabular-nums">{timeLabel(b.startsAt)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold">
              {b.firstName} <span className="font-normal text-ink-muted">· {b.service}</span>
            </p>
            <p className="text-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden="true" />
                {lengthLabel(b.minutes)}
              </span>
              {gaps[b.id] && !cancelled ? (
                <span title="Kept free after this booking, so nobody books into it">
                  then {gapLabel(gaps[b.id])} free{b.homeArea ? " to travel" : ""}
                </span>
              ) : null}
              <span>{SOURCE[b.source]}</span>
              {b.foundVia === "search" && <span className="tag bg-brand-soft text-brand">{b.foundNew ? "New · found you on Tikka" : "Found you on Tikka"}</span>}
              {b.moved && <span>Moved</span>}
              {b.status === "arrived" && <span className="tag tag--redeemed">Came in</span>}
              {b.status === "no_show" && <span className="tag bg-danger-soft text-danger">No-show</span>}
              {cancelled && <span className="tag bg-surface-sunken text-ink-muted">Cancelled</span>}
              {b.depositPaidKobo ? <span className="tag bg-success-soft text-success">{naira(b.depositPaidKobo / 100)} paid</span> : null}
              <span className="font-mono">{b.code}</span>
            </p>
          </div>
        </div>
        {!cancelled && (
          <div className="flex flex-wrap gap-2 pl-0 sm:pl-[76px]">
            {b.status === "booked" && canMark(b, "arrived", now) && (
              <button type="button" className="btn min-h-11" disabled={pending} onClick={() => act(() => markBookingAction(b.id, "arrived"), "arrived")}>
                <Check size={18} aria-hidden="true" />
                Arrived
              </button>
            )}
            {b.status === "booked" && canMark(b, "no_show", now) && (
              <button type="button" className="btn btn-secondary min-h-11" disabled={pending} onClick={() => act(() => markBookingAction(b.id, "no_show"), "no_show")}>
                <UserX size={18} aria-hidden="true" />
                No-show
              </button>
            )}
            {b.status !== "booked" && (
              <button type="button" className="btn btn-ghost min-h-11" disabled={pending} onClick={() => act(() => markBookingAction(b.id, "booked"), "booked")}>
                Undo
              </button>
            )}
            {!staff && b.phone && (
              <a className="btn btn-secondary min-h-11" href={whatsappLink(b.phone, hiMessage(businessName, b))} target="_blank" rel="noopener noreferrer">
                <ActionIcon kind="whatsapp" />
                WhatsApp
              </a>
            )}
            {!staff && b.status === "booked" && (
              <>
                <button type="button" className="btn btn-secondary min-h-11" onClick={() => (setError(""), setSheet({ kind: "move", b }))}>
                  <MoveRight size={18} aria-hidden="true" />
                  Move
                </button>
                <button type="button" className="btn btn-ghost min-h-11 text-danger" onClick={() => (setError(""), setSheet({ kind: "cancel", b }))}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </li>
    );
  }

  const list = (items: Booking[], empty?: string) =>
    items.length ? (
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">{items.map(row)}</ul>
    ) : empty ? (
      <p className="text-body rounded-card border border-dashed border-line-strong bg-surface-raised p-4 text-ink-muted">{empty}</p>
    ) : null;

  return (
    <div className="grid gap-5">
      {!staff && !todayOnly && (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" className="btn min-h-12" onClick={() => (setError(""), setSheet({ kind: "add" }))}>
            <CalendarPlus size={18} aria-hidden="true" />
            Add a booking
          </button>
          <button type="button" className="btn btn-secondary min-h-12" onClick={() => (setError(""), setSheet({ kind: "block" }))}>
            <Ban size={18} aria-hidden="true" />
            Block a time
          </button>
        </div>
      )}
      {error && !sheet && (
        <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      {marking.length > 0 && (
        <section className="grid gap-2" aria-labelledby="bk-mark">
          <h2 id="bk-mark" className="text-title">
            Did they come?
          </h2>
          {list(marking)}
        </section>
      )}

      <section className="grid gap-2" aria-labelledby="bk-today">
        <h2 id="bk-today" className="text-title">
          Today · {dayLabel(now)}
        </h2>
        {list(todays, "No bookings today.")}
      </section>

      {!todayOnly && (
        <>
          <section className="grid gap-3" aria-labelledby="bk-ahead">
            <h2 id="bk-ahead" className="text-title">
              Coming up
            </h2>
            {ahead.length ? (
              ahead.map((g) => (
                <div key={g.day} className="grid gap-2">
                  <h3 className="text-label text-ink-muted">
                    {g.label} · {g.items.length} {g.items.length === 1 ? "booking" : "bookings"}
                  </h3>
                  {list(g.items)}
                </div>
              ))
            ) : (
              list([], "Nothing booked yet. Share your page link so customers can book.")
            )}
          </section>

          {!staff && blocks.length > 0 && (
            <section className="grid gap-2" aria-labelledby="bk-blocks">
              <h2 id="bk-blocks" className="text-title">
                Blocked times
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
                {blocks.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold">{blockLabel(k)}</p>
                      {k.note && <p className="text-caption text-ink-muted">{k.note}</p>}
                    </div>
                    <button type="button" className="grid size-11 place-items-center rounded-pill text-ink-muted" aria-label="Remove this blocked time" disabled={pending} onClick={() => act(() => removeBlockAction(k.id), "removed")}>
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <details className="grid gap-2">
              <summary className="text-label min-h-11 cursor-pointer py-2 text-ink-muted">Past bookings ({past.length})</summary>
              {list(past)}
            </details>
          )}
        </>
      )}

      {!staff && (
        <>
          <Sheet open={sheet?.kind === "add"} onClose={() => setSheet(null)} title="Add a booking" sub="From WhatsApp, a DM, a call or a walk-in. The time is taken straight away.">
            <AddForm
              services={services}
              rules={rulesFor()}
              pending={pending}
              error={error}
              onSubmit={(v) =>
                act(() => addBookingAction(v), "booked", () => setSheet(null))
              }
            />
          </Sheet>

          <Sheet open={sheet?.kind === "move"} onClose={() => setSheet(null)} title="Move booking" sub={sheet?.kind === "move" ? `${sheet.b.firstName} · ${sheet.b.service} · now ${whenLabel(sheet.b.startsAt)}` : undefined}>
            {sheet?.kind === "move" && (
              <MoveForm
                b={sheet.b}
                rules={rulesFor(sheet.b.id)}
                pending={pending}
                error={error}
                onSubmit={(iso, force) => {
                  const b = sheet.b;
                  act(() => moveBookingAction(b.id, iso, force), "moved", () =>
                    setSheet({
                      kind: "tell",
                      title: `Moved to ${whenLabel(iso)}`,
                      href: b.phone ? whatsappLink(b.phone, movedMessage(businessName, { ...b, startsAt: iso })) : null,
                    }),
                  );
                }}
              />
            )}
          </Sheet>

          <Sheet open={sheet?.kind === "cancel"} onClose={() => setSheet(null)} title={sheet?.kind === "cancel" ? `Cancel ${sheet.b.firstName}'s booking?` : "Cancel booking"} sub={
              sheet?.kind === "cancel"
                ? `${sheet.b.service} · ${whenLabel(sheet.b.startsAt)}. The time becomes free for others straight away.${sheet.b.depositPaidKobo ? ` ${sheet.b.firstName} paid a ${naira(sheet.b.depositPaidKobo / 100)} deposit: refund it yourself if you've agreed to (Tikka doesn't refund).` : ""}`
                : undefined
            }
          >
            {sheet?.kind === "cancel" && (
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  className="btn min-h-12 bg-danger text-on-danger"
                  disabled={pending}
                  onClick={() => {
                    const b = sheet.b;
                    act(() => cancelBookingAction(b.id), "cancelled", () =>
                      setSheet({ kind: "tell", title: "Booking cancelled", href: b.phone ? whatsappLink(b.phone, cancelledMessage(businessName, b)) : null }),
                    );
                  }}
                >
                  Yes, cancel it
                </button>
                <button type="button" className="btn btn-secondary min-h-12" onClick={() => setSheet(null)}>
                  Keep it
                </button>
                <p role="alert" className="text-caption min-h-5 text-danger">
                  {error}
                </p>
              </div>
            )}
          </Sheet>

          <Sheet open={sheet?.kind === "block"} onClose={() => setSheet(null)} title="Block a time" sub="For a day off, an errand or a walk-in. Customers won't see these times.">
            <BlockForm
              pending={pending}
              error={error}
              onSubmit={(s, e, note) => {
                setError("");
                start(async () => {
                  const r = await blockTimeAction(s, e, note);
                  if (r.kind !== "blocked") return setError(PROBLEM_TEXT[r.kind] ?? "That didn't work. Try again.");
                  const clashes = (r.clashes as { first_name: string; service: string; starts_at: string }[]) ?? [];
                  router.refresh();
                  setSheet({
                    kind: "tell",
                    title: "Time blocked",
                    href: null,
                    note: clashes.length
                      ? `You have ${clashes.length} ${clashes.length === 1 ? "booking" : "bookings"} then: ${clashes.map((c) => `${c.first_name} at ${timeLabel(c.starts_at)}`).join(", ")}. Move or cancel ${clashes.length === 1 ? "it" : "them"} if you need to.`
                      : undefined,
                  });
                });
              }}
            />
          </Sheet>

          <Sheet open={sheet?.kind === "tell"} onClose={() => setSheet(null)} title={sheet?.kind === "tell" ? sheet.title : ""}>
            {sheet?.kind === "tell" && (
              <div className="mt-4 grid gap-3">
                {sheet.note && <p className="text-body rounded-md bg-gold-soft px-4 py-3">{sheet.note}</p>}
                {sheet.href && (
                  <a href={sheet.href} target="_blank" rel="noopener noreferrer" className="btn min-h-12" onClick={() => setTimeout(() => setSheet(null), 0)}>
                    <ActionIcon kind="whatsapp" />
                    Tell them on WhatsApp
                  </a>
                )}
                <button type="button" className="btn btn-secondary min-h-12" onClick={() => setSheet(null)}>
                  Done
                </button>
              </div>
            )}
          </Sheet>
        </>
      )}
    </div>
  );
}

function blockLabel(k: BookingBlock): string {
  const s = watParts(k.startsAt);
  const e = watParts(k.endsAt);
  if (s.minute === 0 && e.minute === 0 && new Date(k.endsAt).getTime() - new Date(k.startsAt).getTime() === 86_400_000) return `${dayLabel(k.startsAt)} · whole day`;
  return s.day === e.day ? `${dayLabel(k.startsAt)} · ${timeLabel(k.startsAt)} – ${timeLabel(k.endsAt)}` : `${whenLabel(k.startsAt)} – ${whenLabel(k.endsAt)}`;
}

function ForceToggle({ force, setForce }: { force: boolean; setForce: (v: boolean) => void }) {
  return (
    <label className="mt-3 flex min-h-11 items-start gap-3">
      <input type="checkbox" className="mt-1 size-5 shrink-0" checked={force} onChange={(e) => setForce(e.target.checked)} />
      <span className="text-body">
        Fit them in anyway
        <span className="text-caption block text-ink-muted">Shows every time, even full or closed ones.</span>
      </span>
    </label>
  );
}

function AddForm({ services, rules, pending, error, onSubmit }: { services: BoardService[]; rules: BookingRules; pending: boolean; error: string; onSubmit: (v: { serviceId: string; startsAt: string; name: string; phone: string; force: boolean }) => void }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [at, setAt] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const svc = services.find((s) => s.id === serviceId);
  if (!svc) return <p className="text-body mt-4">Add your services on your page first.</p>;
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (at) onSubmit({ serviceId, startsAt: at, name, phone, force });
      }}
    >
      <label className="grid gap-1">
        <span className="text-label">Service</span>
        <select className="input" value={serviceId} onChange={(e) => (setServiceId(e.target.value), setAt(null))}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {lengthLabel(s.minutes)}
            </option>
          ))}
        </select>
      </label>
      <ForceToggle force={force} setForce={(v) => (setForce(v), setAt(null))} />
      <TimePicker key={`${serviceId}-${force}`} rules={rules} minutes={svc.minutes} force={force} onPick={setAt} />
      <label className="grid gap-1">
        <span className="text-label">Their first name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
      </label>
      <label className="grid gap-1">
        <span className="text-label">Their WhatsApp number</span>
        <input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0803 123 4567" required />
        <span className="text-caption text-ink-muted">{phone.trim() && !normalizeNgPhone(phone) ? "Type a Nigerian number, like 0803 123 4567." : "So you can remind them and send their pass."}</span>
      </label>
      <button type="submit" className="btn min-h-12" disabled={pending || !at || !name.trim() || !normalizeNgPhone(phone)}>
        {pending ? "Saving…" : at ? `Book ${whenLabel(at)}` : "Pick a time"}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
    </form>
  );
}

function MoveForm({ b, rules, pending, error, onSubmit }: { b: Booking; rules: BookingRules; pending: boolean; error: string; onSubmit: (iso: string, force: boolean) => void }) {
  const [at, setAt] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  return (
    <div className="mt-2 grid gap-3">
      <ForceToggle force={force} setForce={(v) => (setForce(v), setAt(null))} />
      <TimePicker key={String(force)} rules={rules} minutes={b.minutes} force={force} onPick={setAt} />
      <button type="button" className="btn min-h-12" disabled={pending || !at} onClick={() => at && onSubmit(at, force)}>
        {pending ? "Moving…" : at ? `Move to ${whenLabel(at)}` : "Pick a new time"}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
    </div>
  );
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);

function BlockForm({ pending, error, onSubmit }: { pending: boolean; error: string; onSubmit: (start: string, end: string, note: string) => void }) {
  const today = useMemo(() => todayKey(new Date()), []);
  const [day, setDay] = useState(today);
  const [whole, setWhole] = useState(true);
  const [from, setFrom] = useState(9 * 60);
  const [to, setTo] = useState(13 * 60);
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const s = whole ? watInstant(day, 0) : watInstant(day, from);
        const en = whole ? watInstant(day, 24 * 60) : watInstant(day, to);
        onSubmit(new Date(s).toISOString(), new Date(en).toISOString(), note);
      }}
    >
      <label className="grid gap-1">
        <span className="text-label">Day</span>
        <input type="date" className="input" value={day} min={today} onChange={(e) => setDay(e.target.value || today)} required />
      </label>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="text-label mb-1">Which times?</legend>
        <button type="button" aria-pressed={whole} onClick={() => setWhole(true)} className={`min-h-11 rounded-md border font-semibold ${whole ? "border-brand bg-brand-soft text-brand" : "border-line-strong"}`}>
          Whole day
        </button>
        <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)} className={`min-h-11 rounded-md border font-semibold ${!whole ? "border-brand bg-brand-soft text-brand" : "border-line-strong"}`}>
          Some hours
        </button>
      </fieldset>
      {!whole && (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-label">From</span>
            <select className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {HALF_HOURS.map((m) => (
                <option key={m} value={m}>
                  {slotLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-label">To</span>
            <select className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {HALF_HOURS.filter((m) => m > from).concat(24 * 60).map((m) => (
                <option key={m} value={m}>
                  {m === 24 * 60 ? "Midnight" : slotLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="grid gap-1">
        <span className="text-label">Note (only you see it)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="e.g. Bridal job in Ikeja" />
      </label>
      <button type="submit" className="btn min-h-12" disabled={pending || (!whole && to <= from)}>
        {pending ? "Blocking…" : "Block this time"}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
    </form>
  );
}
