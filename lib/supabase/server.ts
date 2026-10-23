import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase as the signed-in person (RLS applies), for server components, server actions and
 * route handlers. A new client per request. Server components can't write cookies; the proxy
 * refreshes the session before they render, so the failed write there is harmless.
 */
export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: the proxy has already refreshed the session.
        }
      },
    },
  });
}
