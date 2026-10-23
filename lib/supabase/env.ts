// The public Supabase settings (safe in the browser: the publishable key only has what RLS allows).
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  return { url, key };
}

/** Where auth emails and Google send people back to. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Whether Google sign-in is switched on in Supabase (Authentication › Sign In / Providers).
 * Read from Supabase's public settings, so the button can say so instead of opening an error page.
 */
export async function googleEnabled(): Promise<boolean> {
  const { url, key } = supabaseEnv();
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 300 } });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return !!settings.external?.google;
  } catch {
    return false;
  }
}
