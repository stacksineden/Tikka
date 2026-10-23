import "server-only";

import { cookies } from "next/headers";
import { cityId, CITY_COOKIE, parseMarketFilters, type CityId, type MarketFilters } from "./market";

/** The visitor's remembered city (Lagos until they pick one). */
export async function rememberedCity(): Promise<CityId> {
  return cityId((await cookies()).get(CITY_COOKIE)?.value);
}

/** Grid filters: an explicit ?city= wins (empty means all of Nigeria); otherwise the remembered city. */
export async function gridFilters(sp: Record<string, string | string[] | undefined>, preset: Partial<MarketFilters> = {}): Promise<MarketFilters> {
  const f = parseMarketFilters(sp);
  const city = "city" in sp ? f.city : await rememberedCity();
  return { ...f, city, ...preset };
}
