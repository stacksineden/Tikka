import { Accessibility, AirVent, ArrowLeftRight, Armchair, Baby, Banknote, CreditCard, Languages, Mars, SquareParking, Venus, Wifi, Zap, type LucideIcon } from "lucide-react";
import { EXTRA_GROUPS, LANGUAGES } from "@/lib/listing";

// "Good to know" on Tikka's listing page (like Airbnb's "What this place offers"): the extras the
// business picked in Your Tikka listing, each on its own line with an icon, grouped.

const ICONS: Record<string, LucideIcon> = {
  ac: AirVent,
  power: Zap,
  parking: SquareParking,
  wifi: Wifi,
  waiting: Armchair,
  women: Venus,
  men: Mars,
  kids: Baby,
  wheelchair: Accessibility,
  cash: Banknote,
  transfer: ArrowLeftRight,
  card: CreditCard,
};

const GROUP_LABEL: Record<string, string> = { comforts: "Comforts", who: "Who it's for", pay: "Payment" };

/** "English, Pidgin and Yoruba". */
function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function ListingExtras({ amenities = [], languages = [] }: { amenities?: string[]; languages?: string[] }) {
  const groups = EXTRA_GROUPS.map((g) => ({ id: g.id, label: GROUP_LABEL[g.id] ?? g.label, items: g.items.filter((i) => amenities.includes(i.id)) })).filter(
    (g) => g.items.length > 0,
  );
  const spoken = LANGUAGES.filter((l) => languages.includes(l.id)).map((l) => l.label as string);
  if (!groups.length && !spoken.length) return null;

  return (
    <section aria-labelledby="extras-h">
      <h2 id="extras-h" className="text-[26px] font-bold tracking-tight">
        Good to know
      </h2>
      <div className="mt-5 grid gap-7">
        {groups.map((g) => (
          <div key={g.id}>
            <h3 className="text-label text-ink-muted">{g.label}</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {g.items.map((i) => {
                const Icon = ICONS[i.id];
                return (
                  <li key={i.id} className="text-body-lg flex items-center gap-3.5">
                    {Icon && <Icon size={24} strokeWidth={1.6} className="shrink-0" aria-hidden="true" />}
                    {i.label}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {spoken.length > 0 && (
          <div>
            <h3 className="text-label text-ink-muted">Languages</h3>
            <p className="text-body-lg mt-3 flex items-center gap-3.5">
              <Languages size={24} strokeWidth={1.6} className="shrink-0" aria-hidden="true" />
              Speaks {andList(spoken)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
