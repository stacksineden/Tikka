// Privacy requests (/admin): the number someone asks about, as Tikka stores it.

import { normalizeNgPhone } from "./setup";

/** "0803 123 4567", "234803…" or "+234803…" → "+2348031234567"; other countries need their "+". */
export function requestPhone(input: string): string | null {
  const ng = normalizeNgPhone(input);
  if (ng) return ng;
  const t = input.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}
