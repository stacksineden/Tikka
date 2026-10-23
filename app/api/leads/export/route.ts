import { type NextRequest } from "next/server";
import { getDrops, getLeads } from "@/lib/data";
import { filterLeads, leadsCsv } from "@/lib/leads";
import { getSessionUser } from "@/lib/session";

// export_leads (TECH_PLAN §10): owners only. Staff and signed-out callers get nothing.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "owner") return new Response("Only the business owner can export leads.", { status: 403 });
  const dropId = request.nextUrl.searchParams.get("drop") || undefined;
  const [leads, drops] = await Promise.all([getLeads(user), getDrops(user)]);
  const rows = filterLeads(leads, { tab: "all", dropId });
  const names = Object.fromEntries(drops.map((d) => [d.id, d.name]));
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const slug = dropId ? (drops.find((d) => d.id === dropId)?.slug ?? "drop") : "all-drops";
  return new Response(leadsCsv(rows, names), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tikka-leads-${slug}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
