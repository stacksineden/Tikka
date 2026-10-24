// PRD C1: the privacy policy and terms must be live before the first real claim (the claim sheet
// links to them for consent). Runs before `next build`: on a Vercel production build it fails
// while either page is missing, still marked as a placeholder, or has a blank left to fill in; elsewhere it only warns.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const PAGES = ["app/(site)/privacy/page.tsx", "app/(site)/terms/page.tsx"];
// Put this marker in a page until the lawyer-checked text is in.
const MARKER = "LEGAL_PLACEHOLDER";
// Blanks still to fill in are written <Blank>privacy email</Blank> (components/site/LegalPage.tsx).
const BLANK = "<Blank";

const missing = PAGES.filter((p) => {
  const file = join(root, p);
  if (!existsSync(file)) return true;
  const text = readFileSync(file, "utf8");
  return text.includes(MARKER) || text.includes(BLANK);
});

if (missing.length) {
  const msg = `Privacy policy and terms must be live before the first real claim (PRD C1). Not ready: ${missing.join(", ")}`;
  if (process.env.VERCEL_ENV === "production" || process.env.TIKKA_REQUIRE_LEGAL === "1") {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`Warning: ${msg}`);
}
