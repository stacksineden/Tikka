import { Bell, CalendarCheck, Check, Landmark, MapPin, Star } from "lucide-react";

// Drawn screens for the For businesses features (components/landing/ForBusinesses.tsx): what the
// owner and their customers actually see, made from the real screens' parts. No photos, no data.

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-card border border-line bg-surface-raised p-4 shadow-card sm:p-5">{children}</div>
      <span className="text-serial absolute -top-3 left-5 rounded-pill bg-ink px-2.5 py-1 font-mono text-surface uppercase">{label}</span>
    </div>
  );
}

/** Your website: the business page with work, services and Book. */
export function WebsiteVisual() {
  const tiles = ["bg-brand-soft", "bg-gold-soft", "bg-success-soft", "bg-surface-sunken", "bg-brand-soft", "bg-gold-soft"];
  return (
    <Frame label="usetikka.com/adunni">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-pill bg-brand text-[15px] font-bold text-on-brand">AB</span>
        <span>
          <b className="block text-[16px] leading-tight">Adunni Braids</b>
          <span className="flex items-center gap-1 text-[12px] text-ink-muted">
            <MapPin size={12} /> Bodija, Ibadan · <Star size={12} className="fill-current" /> 4.9 (38)
          </span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {tiles.map((t, i) => (
          <span key={i} className={`aspect-square rounded-md ${t}`} />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {[
          ["Knotless braids", "Short, medium or long · from ₦12,000"],
          ["Silk press", "1 hour 30 min · ₦9,000"],
          ["Home service", "₦3,000 travel fee in Ibadan"],
        ].map(([n, d]) => (
          <li key={n} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <b className="block text-[14px]">{n}</b>
              <span className="block text-[12px] text-ink-muted">{d}</span>
            </span>
            <span className="rounded-pill border border-line-strong px-3 py-1 text-[12px] font-semibold">Book</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Deposits: the rule they see, and where the money goes. */
export function DepositVisual() {
  return (
    <Frame label="Deposits">
      <p className="text-[12px] font-semibold text-ink-muted">Your deposit</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[13px] font-semibold">
        {["20%", "30%", "Fixed ₦"].map((t, i) => (
          <span key={t} className={`rounded-pill border py-2 ${i === 1 ? "border-ink bg-ink text-surface" : "border-line-strong"}`}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-4 rounded-md bg-surface-sunken p-3 text-[13px]">
        <div className="flex justify-between"><span>Knotless braids · medium</span><b>₦15,000</b></div>
        <div className="mt-1 flex justify-between text-ink-muted"><span>Deposit to book</span><b className="text-ink">₦4,500</b></div>
        <div className="flex justify-between text-ink-muted"><span>Left to pay at the shop</span><span>₦10,500</span></div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-md border border-line p-3">
        <span className="grid size-9 place-items-center rounded-pill bg-success-soft text-success">
          <Landmark size={18} />
        </span>
        <span className="min-w-0 flex-1 text-[13px]">
          <b className="block">₦4,500 to your bank</b>
          <span className="text-ink-muted">Account ending 4412 · next working day</span>
        </span>
        <Check size={18} className="text-success" />
      </div>
    </Frame>
  );
}

/** Today and Money: who's coming, who owes, the week. */
export function TodayVisual() {
  return (
    <Frame label="Today">
      <div className="flex items-center justify-between">
        <b className="text-[16px]">Saturday</b>
        <span className="text-[12px] text-ink-muted">3 coming · ₦18,500 to collect</span>
      </div>
      <ul className="mt-3 grid gap-2">
        {[
          ["10:30", "Aisha", "Deposit paid", true],
          ["2:00", "Tolu", "Arrived · Paid by transfer", true],
          ["4:30", "Kemi", "₦8,000 still owed", false],
        ].map(([t, n, s, ok]) => (
          <li key={n as string} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
            <span className="font-mono text-[12px] text-ink-muted">{t}</span>
            <b className="flex-1 text-[14px]">{n}</b>
            <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${ok ? "bg-success-soft text-success" : "bg-gold-soft text-gold-text"}`}>{s}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["In", "₦186,500"],
          ["Spent", "₦32,000"],
          ["Kept", "₦154,500"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-surface-sunken px-2 py-2.5">
            <span className="block text-[11px] text-ink-muted">{k} this week</span>
            <b className="text-[14px]">{v}</b>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-muted">
        <Bell size={14} /> 8:00pm · Anything you spent today?
      </div>
    </Frame>
  );
}

/** Your customers: one person, everything about them. */
export function CustomerVisual() {
  return (
    <Frame label="Customers">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-[15px] font-bold">AO</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[16px] leading-tight">Aisha O.</b>
          <span className="text-[12px] text-ink-muted">0803 ••• ••12 · customer since March</span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Visits", "6"],
          ["Spent", "₦92,000"],
          ["Owes", "₦0"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-surface-sunken px-2 py-2.5">
            <span className="block text-[11px] text-ink-muted">{k}</span>
            <b className="text-[14px]">{v}</b>
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-[13px]">
        <li className="flex items-center gap-2">
          <CalendarCheck size={16} className="text-ink-muted" /> Next visit: Saturday, 10:30am
        </li>
        <li className="rounded-md bg-gold-soft px-3 py-2">Note: sensitive scalp, likes medium length</li>
        <li className="text-ink-muted">Birthday 14 March</li>
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[13px] font-semibold">
        <span className="rounded-pill border border-line-strong py-2">Message</span>
        <span className="rounded-pill bg-brand py-2 text-on-brand">Book them in</span>
      </div>
    </Frame>
  );
}
