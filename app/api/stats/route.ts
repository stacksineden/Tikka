import { connection } from "next/server";
import { getPlatformStats } from "@/lib/data";

// The landing page's live numbers. Polled every 20 s by components/landing/LiveStats.tsx.
export async function GET() {
  await connection(); // always fresh: never prerendered
  const stats = await getPlatformStats(new Date());
  return Response.json(stats, { headers: { "Cache-Control": "public, max-age=10, s-maxage=10" } });
}
