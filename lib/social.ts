// Social links on the card and business page: Instagram, TikTok, Facebook, X and YouTube. Owners
// type a username ("@glowstudio") or paste a link ("https://www.tiktok.com/@glowstudio?lang=en");
// both become the same stored value, and socialHref() turns that into the profile link.
// Pure, so the rules are tested.

export type SocialKind = "instagram" | "tiktok" | "facebook" | "x" | "youtube";

export const SOCIAL_KINDS: SocialKind[] = ["instagram", "tiktok", "facebook", "x", "youtube"];

export function isSocial(kind: string): kind is SocialKind {
  return (SOCIAL_KINDS as string[]).includes(kind);
}

export const SOCIAL_NAME: Record<SocialKind, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
};

/** The hosts each platform's links use (with or without www., m., mobile., web.). */
const HOSTS: Record<SocialKind, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com"],
};

/** Usernames each platform allows. */
const NAME: Record<SocialKind, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/i,
  tiktok: /^[a-z0-9._]{2,24}$/i,
  facebook: /^[a-z0-9.]{3,50}$/i,
  x: /^[a-z0-9_]{1,15}$/i,
  youtube: /^[a-z0-9._-]{3,30}$/i,
};

/** Facebook paths that aren't a page name. */
const FB_RESERVED = new Set(["profile.php", "pages", "people", "groups", "events", "watch", "share", "sharer", "login", "home.php"]);

/** A link's host and path, or null when it isn't a link to this platform. */
function linkParts(kind: SocialKind, input: string): { path: string[]; search: URLSearchParams } | null {
  const looksLikeLink = /^https?:\/\//i.test(input) || /^(www\.|m\.|mobile\.|web\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(input);
  if (!looksLikeLink) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|web\.)/, "");
  if (!HOSTS[kind].includes(host)) return null;
  return { path: url.pathname.split("/").filter(Boolean), search: url.searchParams };
}

/**
 * The value stored for a social link, or null when it isn't a username or a link to that platform.
 * Instagram, TikTok, X: the username without "@". Facebook: the page name, or "profile.php?id=…".
 * YouTube: "@handle", or "channel/UC…", "c/name", "user/name" for older links.
 */
export function parseSocial(kind: SocialKind, raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  const link = linkParts(kind, input);
  // A link to another site, or anything with a slash or a space, is never a username.
  if (!link && /[/\s]/.test(input)) return null;

  switch (kind) {
    case "instagram":
    case "x": {
      const name = link ? link.path[0] : input.replace(/^@/, "");
      return name && NAME[kind].test(name) && !(kind === "x" && ["home", "intent", "i", "share"].includes(name.toLowerCase())) ? name : null;
    }
    case "tiktok": {
      const name = link ? (link.path[0]?.startsWith("@") ? link.path[0].slice(1) : null) : input.replace(/^@/, "");
      return name && NAME.tiktok.test(name) ? name : null;
    }
    case "facebook": {
      if (link) {
        const first = link.path[0] ?? "";
        if (first === "profile.php") {
          const id = link.search.get("id") ?? "";
          return /^\d{5,20}$/.test(id) ? `profile.php?id=${id}` : null;
        }
        if (first === "people" && link.path[2] && /^\d{5,20}$/.test(link.path[2])) return `profile.php?id=${link.path[2]}`;
        if (FB_RESERVED.has(first.toLowerCase())) return null;
        return NAME.facebook.test(first) ? first : null;
      }
      const name = input.replace(/^@/, "");
      return NAME.facebook.test(name) && !FB_RESERVED.has(name.toLowerCase()) ? name : null;
    }
    case "youtube": {
      if (link) {
        const [first = "", second = ""] = link.path;
        if (first.startsWith("@")) return NAME.youtube.test(first.slice(1)) ? first : null;
        if (first === "channel" && /^UC[a-z0-9_-]{22}$/i.test(second)) return `channel/${second}`;
        if ((first === "c" || first === "user") && NAME.youtube.test(second)) return `${first}/${second}`;
        return null;
      }
      const handle = input.replace(/^@/, "");
      return NAME.youtube.test(handle) ? `@${handle}` : null;
    }
  }
}

/** The profile link for a stored value. */
export function socialHref(kind: SocialKind, value: string): string {
  switch (kind) {
    case "instagram":
      return `https://instagram.com/${value}`;
    case "tiktok":
      return `https://www.tiktok.com/@${value}`;
    case "facebook":
      return `https://www.facebook.com/${value}`;
    case "x":
      return `https://x.com/${value}`;
    case "youtube":
      return `https://www.youtube.com/${value}`;
  }
}
