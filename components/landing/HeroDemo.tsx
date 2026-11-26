import { CalendarCheck, Check, MessageCircle, Wallet } from "lucide-react";
import type { CSSProperties } from "react";
import "./hero-demo.css";

// The For businesses hero (docs/BUSINESS_PAGE_COPY.md): one phone that plays the story in four
// scenes: they ask the price, they pick a free time and pay the deposit, the deposit is yours, you
// see your day and week. CSS only (hero-demo.css), no JavaScript; reduced motion shows the booking.
// The phone screen is always light, like a real phone in the hand.

const at = (s: number, d = 0) => ({ "--at": `${s}s`, "--d": `${d}s` }) as CSSProperties;

const STEPS = [
  { label: "They ask the price", Icon: MessageCircle },
  { label: "They pick a free time", Icon: CalendarCheck },
  { label: "The deposit is yours", Icon: Wallet },
  { label: "You see your week", Icon: Check },
];

function Avatar({ initials, className = "" }: { initials: string; className?: string }) {
  return <span className={`grid size-9 shrink-0 place-items-center rounded-pill bg-brand text-[13px] font-bold text-on-brand ${className}`}>{initials}</span>;
}

/** 1. A message thread: "How much?", answered with the booking link. */
function AskScene() {
  return (
    <div className="hd-scene flex flex-col bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid size-9 place-items-center rounded-pill bg-surface-sunken text-[13px] font-bold">AO</span>
        <span>
          <b className="block text-[14px] leading-tight">Aisha O.</b>
          <span className="text-[11px] text-ink-muted">Message from your post</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 py-3 text-[13px] leading-snug">
        <p className="max-w-[78%] self-start rounded-2xl rounded-bl-md bg-surface-sunken px-3.5 py-2.5">Hi! How much for knotless braids? 😍 Are you free this weekend?</p>
        <p className="hd-pop max-w-[78%] self-end rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-on-brand" style={at(0, 1.2)}>
          Prices and my free times are here. Book any time 👇
        </p>
        <div className="hd-pop w-[78%] self-end overflow-hidden rounded-2xl border border-line bg-surface-raised" style={at(0, 2)}>
          <div className="flex items-center gap-2.5 p-3">
            <Avatar initials="AB" />
            <span className="min-w-0">
              <b className="block truncate text-[13px]">Adunni Braids</b>
              <span className="block truncate text-[11px] text-ink-muted">usetikka.com/adunni</span>
            </span>
          </div>
          <span className="block border-t border-line py-2 text-center text-[12px] font-semibold text-brand">Book a time</span>
        </div>
      </div>
    </div>
  );
}

/** 2. Her page: a service, the free times, one tapped, the deposit button. */
function BookScene() {
  const slots = ["9:00am", "10:30am", "1:00pm", "3:30pm"];
  return (
    <div className="hd-scene flex flex-col bg-surface px-3.5 pt-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar initials="AB" />
        <span>
          <b className="block text-[14px] leading-tight">Adunni Braids</b>
          <span className="text-[11px] text-ink-muted">Bodija, Ibadan · ★ 4.9</span>
        </span>
      </div>
      <div className="mt-3 rounded-md border border-line bg-surface-raised p-2.5">
        <div className="flex justify-between text-[13px] font-semibold">
          <span>Knotless braids · medium</span>
          <span>₦15,000</span>
        </div>
        <span className="text-[11px] text-ink-muted">4 hours · ₦4,500 deposit to book</span>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-ink-muted">Free on Saturday</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {slots.map((s, i) => (
          <span key={s} className="relative rounded-pill border border-line-strong py-1.5 text-center text-[12px] font-semibold">
            {s}
            {i === 1 && (
              <span className="hd-tap absolute inset-[-1px] grid place-items-center rounded-pill bg-ink text-surface" style={at(4, 1.2)}>
                {s}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="hd-pop mt-3 grid gap-1 rounded-md border border-line bg-surface-raised p-2.5 text-[12px]" style={at(4, 1.8)}>
        <span className="text-[11px] font-semibold text-ink-muted">Your details</span>
        <span className="flex justify-between"><span className="text-ink-muted">Name</span><b>Aisha O.</b></span>
        <span className="flex justify-between"><span className="text-ink-muted">WhatsApp</span><b>0803 ••• ••12</b></span>
      </div>
      <span className="hd-press mt-auto mb-4 block rounded-pill bg-brand py-2.5 text-center text-[13px] font-semibold text-on-brand" style={at(4, 2.4)}>
        Pay ₦4,500 deposit
      </span>
    </div>
  );
}

/** 3. Booked: the customer's pass, and the owner's phone buzzing with the deposit. */
function PaidScene() {
  return (
    <div className="hd-scene flex flex-col bg-surface px-3.5 pt-14">
      <div className="hd-drop absolute inset-x-2.5 top-2.5 z-10 rounded-xl border border-line bg-surface-raised p-3 shadow-card" style={at(8, 0.8)}>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
          <span className="grid size-4 place-items-center rounded bg-brand text-[9px] text-on-brand">t</span> Tikka · now
        </div>
        <b className="mt-1 block text-[13px]">₦4,500 deposit paid</b>
        <span className="block text-[12px] leading-snug text-ink-muted">Aisha booked Knotless braids, Saturday 10:30am</span>
      </div>
      <div className="mt-3 grid justify-items-center text-center">
        <span className="grid size-12 place-items-center rounded-pill bg-success-soft text-success">
          <Check size={28} aria-hidden="true" />
        </span>
        <b className="mt-3 text-[18px]">You&apos;re booked</b>
        <span className="text-[12px] text-ink-muted">Adunni Braids · Bodija, Ibadan</span>
      </div>
      <dl className="mt-4 grid gap-1.5 rounded-md border border-line bg-surface-raised p-3 text-[12px]">
        {[
          ["When", "Saturday, 10:30am"],
          ["Service", "Knotless braids · medium"],
          ["Deposit paid", "₦4,500"],
          ["At the shop", "₦10,500"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="hd-pop mt-3 text-center text-[11px] text-ink-muted" style={at(8, 2)}>
        In your bank the next working day
      </p>
    </div>
  );
}

/** 4. Her Today and the week's money. */
function WeekScene() {
  const coming = [
    ["10:30", "Aisha", "Braids", "Paid ₦4,500"],
    ["2:00", "Tolu", "Silk press", "Paid ₦3,000"],
    ["4:30", "Kemi", "Wig install", "₦8,000 due"],
  ];
  const money = [
    ["In", "₦186,500", "w-full"],
    ["Spent", "₦32,000", "w-[18%]"],
    ["Kept", "₦154,500", "w-[83%]"],
  ];
  return (
    <div className="hd-scene flex flex-col bg-surface px-3.5 pt-3.5">
      <b className="text-[16px]">Today</b>
      <span className="text-[11px] text-ink-muted">Saturday · 3 coming</span>
      <ul className="mt-2.5 grid gap-1.5">
        {coming.map(([t, n, s, p], i) => (
          <li key={n} className="hd-pop flex items-center gap-2.5 rounded-md border border-line bg-surface-raised px-3 py-2" style={at(12, 0.3 + i * 0.35)}>
            <span className="font-mono text-[11px] text-ink-muted">{t}</span>
            <span className="min-w-0 flex-1">
              <b className="block text-[12px] leading-tight">{n}</b>
              <span className="block truncate text-[11px] text-ink-muted">{s}</span>
            </span>
            <span className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold ${p.startsWith("Paid") ? "bg-success-soft text-success" : "bg-gold-soft text-gold-text"}`}>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-md border border-line bg-surface-raised p-2.5">
        <b className="text-[12px]">This week</b>
        <div className="mt-1.5 grid gap-1.5">
          {money.map(([k, v, w], i) => (
            <div key={k}>
              <div className="flex justify-between text-[11px]">
                <span className="text-ink-muted">{k}</span>
                <b>{v}</b>
              </div>
              <div className="mt-1 h-1.5 rounded-pill bg-surface-sunken">
                <div className={`hd-grow h-full rounded-pill ${k === "Spent" ? "bg-line-strong" : k === "Kept" ? "bg-success" : "bg-brand"} ${w}`} style={at(12, 1.4 + i * 0.25)} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <nav className="mt-auto -mx-3.5 grid grid-cols-5 border-t border-line bg-surface-raised py-2 text-center text-[10px] text-ink-muted">
        {["Today", "Calendar", "Customers", "Money", "More"].map((t, i) => (
          <span key={t} className={i === 0 ? "font-bold text-brand" : ""}>
            {t}
          </span>
        ))}
      </nav>
    </div>
  );
}

export function HeroDemo() {
  return (
    <figure className="grid justify-items-center gap-5" aria-label="How a booking reaches you on Tikka: they ask the price, pick a free time and pay a deposit, and you see your week.">
      <div aria-hidden="true" className="w-[248px] rounded-[34px] border-[8px] border-night-raised bg-night-raised shadow-card sm:w-[264px]">
        <div data-theme="light" className="hd-screen h-[420px] rounded-[26px] text-ink sm:h-[440px]">
          <AskScene />
          <BookScene />
          <PaidScene />
          <WeekScene />
        </div>
      </div>
      <ol aria-hidden="true" className="grid w-full max-w-[420px] grid-cols-4 gap-2">
        {STEPS.map(({ label, Icon }, i) => (
          <li key={label} className={`hd-step-${i + 1} relative grid justify-items-center gap-1.5 rounded-md px-1 py-2 text-center`}>
            <span className="hd-step-on absolute inset-0 rounded-md bg-night-raised ring-1 ring-gold/50" style={at(i * 4)} />
            <Icon size={18} className="relative text-gold" aria-hidden="true" />
            <span className="relative text-[11px] leading-tight text-on-night">{label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
