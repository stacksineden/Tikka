import "server-only";

// A starting map pin from a business's public area, city and state (docs/HOMEPAGE_PLAN.md, the map):
// OpenStreetMap's free place lookup (Nominatim). Only those three public words are sent, never anyone's
// details, and the request names itself only as Tikka. The pin is marked approximate until the owner
// places their own (set_approx_location() never moves an owner's pin). Never throws.

export async function approxLocation(area: string, city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const tries = [
    [area, city, state],
    [city, state],
  ].map((parts) => parts.filter(Boolean).join(", "));
  for (const q of tries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ng&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "User-Agent": "Tikka/1.0", "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const rows = (await res.json()) as { lat: string; lon: string }[];
      const lat = Number(rows[0]?.lat);
      const lng = Number(rows[0]?.lon);
      if (lat >= 4 && lat <= 14 && lng >= 2.5 && lng <= 15) return { lat, lng };
    } catch {
      // Try the wider place, or give up quietly.
    }
  }
  return null;
}
