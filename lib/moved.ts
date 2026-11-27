import "server-only";

import { permanentRedirect } from "next/navigation";
import { dbPageMovedTo } from "./business-db";

/**
 * When a business changed its page address, links with the old one (its page, a drop's claim link,
 * a collection, its listing) go to the same place under the new address, keeping the query
 * (?c=qr&p=… still counts the source). Call it right before notFound(); it returns if nothing moved.
 */
export async function redirectIfMoved(
  slug: string,
  to: (current: string) => string,
  query?: Record<string, string | string[] | undefined>,
): Promise<void> {
  const current = await dbPageMovedTo(slug);
  if (!current) return;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) for (const x of [v].flat()) if (x !== undefined) qs.append(k, x);
  const s = qs.toString();
  permanentRedirect(`${to(current)}${s ? `?${s}` : ""}`);
}
