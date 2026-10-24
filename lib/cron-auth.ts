import "server-only";

/**
 * The scheduler (Supabase pg_cron) calls with "Authorization: Bearer <CRON_SECRET>". In production the secret is
 * required (no secret, no run), so nobody else can trigger sends; in development it's optional,
 * so the routes can be called by hand.
 */
export function cronAllowed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
