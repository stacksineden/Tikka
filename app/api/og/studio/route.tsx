import type { NextRequest } from "next/server";
import { studioCaseImage } from "@/lib/og-art";
import { caseStudy } from "@/lib/studio";
import { STUDIO_CATEGORIES } from "@/lib/studio-shared";

// The link preview for a Tikka Studio case study (PRD B11): each one gets its own.
export async function GET(request: NextRequest) {
  const c = caseStudy(request.nextUrl.searchParams.get("slug") ?? "");
  if (!c) return new Response("Not found", { status: 404 });
  const label = c.categories.map((id) => STUDIO_CATEGORIES.find((x) => x.id === id)?.label ?? id).join(" · ");
  return studioCaseImage({ client: c.client, title: c.title, label, cover: c.cover });
}
