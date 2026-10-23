// Copy rules: naira is always ₦, counts read "23 of 600 left", dates like "Sat 31 Oct".

// West Africa Time, the one time zone for all of Nigeria. ("Africa/Lagos" is just its IANA name.)
export const WAT = "Africa/Lagos";

/** Where a business is. Tikka runs across Nigeria, so the city always comes with the area: "Lekki, Lagos". */
export function place(area: string, city: string): string {
  return area && area !== city ? `${area}, ${city}` : city;
}

export function naira(amount: number): string {
  return "₦" + Math.round(amount).toLocaleString("en-NG");
}

/** ₦1.9M, ₦250K, ₦9,500 — for summaries, never tables. */
export function nairaShort(amount: number): string {
  const abs = Math.abs(amount);
  const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  if (abs >= 1_000_000) return "₦" + trim(amount / 1_000_000) + "M";
  if (abs >= 10_000) return "₦" + trim(amount / 1_000) + "K";
  return naira(amount);
}

export function count(n: number): string {
  return n.toLocaleString("en-NG");
}

export function left(remaining: number, total: number): string {
  return `${count(remaining)} of ${count(total)} left`;
}

export function percent(part: number, whole: number, digits = 0): string {
  if (whole <= 0) return "0%";
  const p = (part / whole) * 100;
  return p.toFixed(digits).replace(/\.0+$/, "") + "%";
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: WAT });
  const rest = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: WAT });
  return `${day} ${rest}`;
}

export function clockTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: WAT })
    .replace(":00", "")
    .replace(" ", "")
    .toLowerCase();
}

/** "21 Oct 2027": for dates months away, where the weekday doesn't help and the year does. */
export function dayMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: WAT });
}

export function timeAgo(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function timeLeft(endIso: string, now: Date): string {
  const ms = new Date(endIso).getTime() - now.getTime();
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min left`;
  if (h < 48) return `${h} hr left`;
  return `${Math.floor(h / 24)} days left`;
}
