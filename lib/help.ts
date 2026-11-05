import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { guideProblems, type HelpGuide } from "./help-shared";

// The Help centre's guides: JSON files in content/help/, read on the server. Only published
// guides show; a file that fails its checks is left out (and fails the unit test).

const ROOT = join(process.cwd(), "content", "help");

export function helpGuides(): HelpGuide[] {
  return readdirSync(ROOT)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(ROOT, f), "utf8")) as Record<string, unknown>)
    .filter((g) => guideProblems(g).length === 0)
    .map((g) => g as unknown as HelpGuide)
    .filter((g) => g.published);
}

export function helpGuide(slug: string): HelpGuide | null {
  return helpGuides().find((g) => g.slug === slug) ?? null;
}
