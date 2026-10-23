// Business page addresses: usetikka.com/[slug] (TECH_PLAN §3).

/** Words that would clash with Tikka's own pages, now or later. */
export const RESERVED_SLUGS = new Set([
  "drops", "d", "t", "b", "app", "admin", "api", "og", "login", "logout", "signup", "sign-up", "signin", "sign-in",
  "check-email", "forgot-password", "reset-password", "pricing", "terms", "privacy", "help", "support", "about",
  "settings", "account", "dashboard", "blog", "careers", "contact", "legal", "static", "assets", "brand", "mock",
  "favicon", "icon", "robots", "sitemap", "tikka", "usetikka", "marketplace", "search", "new", "www", "mail",
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** "Glow Studio" → "glowstudio". Short and easy to type into a bio. */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 30);
}

export function slugError(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 30) return "Keep it to 30 characters.";
  if (!SLUG.test(slug) || slug.includes("--")) return "Use lowercase letters, numbers and single hyphens.";
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved. Try another.`;
  return null;
}

/** Free alternatives when a slug is taken: add the city, then numbers. */
export function slugAlternatives(slug: string, city: string, taken: Set<string>, count = 3): string[] {
  const c = suggestSlug(city);
  const pool = [c && `${slug}${c}`.slice(0, 30), c && `${slug}-${c}`.slice(0, 30), ...[2, 3, 4, 5, 6].map((n) => `${slug.slice(0, 28)}${n}`)];
  return pool.filter((s): s is string => !!s && !taken.has(s) && !slugError(s)).slice(0, count);
}

export const PORTFOLIO_MAX = 12;
