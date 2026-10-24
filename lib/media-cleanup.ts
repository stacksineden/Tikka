import "server-only";

import { adminClient } from "./supabase/admin";

// Removes stored files nothing points at any more (replaced logos, covers, removed portfolio
// items), a week after upload; orphan_media() decides which. Runs with the daily job. Storage only
// deletes through its own API, a batch at a time.

export async function removeOrphanMedia(): Promise<number> {
  const admin = adminClient();
  const { data, error } = await admin.rpc("orphan_media", { p_limit: 500 });
  if (error) throw new Error(`orphan_media: ${error.message}`);
  const byBucket = new Map<string, string[]>();
  for (const f of (data ?? []) as { bucket: string; name: string }[]) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name]);
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const { data: gone } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
      removed += gone?.length ?? 0;
    }
  }
  return removed;
}
