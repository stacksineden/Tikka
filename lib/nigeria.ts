// Locations across Nigeria for business setup and the marketplace location picker.
// States are complete; cities are suggestions only (any city can be typed).

export const STATES: { name: string; cities: string[] }[] = [
  { name: "Abia", cities: ["Umuahia", "Aba"] },
  { name: "Adamawa", cities: ["Yola", "Mubi"] },
  { name: "Akwa Ibom", cities: ["Uyo", "Eket", "Ikot Ekpene"] },
  { name: "Anambra", cities: ["Awka", "Onitsha", "Nnewi"] },
  { name: "Bauchi", cities: ["Bauchi"] },
  { name: "Bayelsa", cities: ["Yenagoa"] },
  { name: "Benue", cities: ["Makurdi", "Gboko"] },
  { name: "Borno", cities: ["Maiduguri"] },
  { name: "Cross River", cities: ["Calabar", "Ikom"] },
  { name: "Delta", cities: ["Asaba", "Warri", "Sapele"] },
  { name: "Ebonyi", cities: ["Abakaliki"] },
  { name: "Edo", cities: ["Benin City", "Auchi"] },
  { name: "Ekiti", cities: ["Ado-Ekiti"] },
  { name: "Enugu", cities: ["Enugu", "Nsukka"] },
  { name: "FCT", cities: ["Abuja"] },
  { name: "Gombe", cities: ["Gombe"] },
  { name: "Imo", cities: ["Owerri", "Orlu", "Okigwe"] },
  { name: "Jigawa", cities: ["Dutse"] },
  { name: "Kaduna", cities: ["Kaduna", "Zaria"] },
  { name: "Kano", cities: ["Kano"] },
  { name: "Katsina", cities: ["Katsina"] },
  { name: "Kebbi", cities: ["Birnin Kebbi"] },
  { name: "Kogi", cities: ["Lokoja"] },
  { name: "Kwara", cities: ["Ilorin"] },
  { name: "Lagos", cities: ["Lagos"] },
  { name: "Nasarawa", cities: ["Lafia", "Keffi"] },
  { name: "Niger", cities: ["Minna", "Bida"] },
  { name: "Ogun", cities: ["Abeokuta", "Ijebu-Ode", "Sagamu", "Ota"] },
  { name: "Ondo", cities: ["Akure", "Ondo"] },
  { name: "Osun", cities: ["Osogbo", "Ile-Ife", "Ilesa"] },
  { name: "Oyo", cities: ["Ibadan", "Ogbomoso", "Oyo"] },
  { name: "Plateau", cities: ["Jos"] },
  { name: "Rivers", cities: ["Port Harcourt", "Bonny"] },
  { name: "Sokoto", cities: ["Sokoto"] },
  { name: "Taraba", cities: ["Jalingo"] },
  { name: "Yobe", cities: ["Damaturu"] },
  { name: "Zamfara", cities: ["Gusau"] },
];

export const STATE_NAMES = STATES.map((s) => s.name);

export function citiesFor(state: string): string[] {
  return STATES.find((s) => s.name === state)?.cities ?? [];
}

/** Marketplace categories (PRD A5). */
export const CATEGORIES = [
  "Beauty",
  "Wellness",
  "Fitness",
  "Food & drinks",
  "Fashion",
  "Health",
  "Education",
  "Events",
  "Services",
] as const;
