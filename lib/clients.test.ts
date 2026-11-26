import { describe, expect, it } from "vitest";
import type { Booking } from "./bookings";
import { buildClients, formatPhone, matchesSearch, payLinkReasons, payReasonNote, phoneKey, phoneTail, possibleMatches, relativeDay, repeatedNames, sortClients } from "./clients";
import type { Sale } from "./ledger";

const now = new Date("2026-11-25T15:00:00Z");
const booking = (id: string, phone: string, name: string, startsAt: string, status: Booking["status"], deposit = 0): Booking => ({
  id, service: "Knotless braids", minutes: 360, startsAt, endsAt: startsAt, firstName: name, phone, source: "page", status, code: "BK-X", moved: false, createdAt: startsAt, depositPaidKobo: deposit || undefined, priceKobo: 2_650_000,
});

describe("client book", () => {
  it("joins bookings, sales and walk-ins to one person by number", () => {
    const sales: Sale[] = [
      { id: "s1", at: "2026-11-20T10:00:00Z", name: "Ada", item: "Knotless braids", totalKobo: 1_850_000, payments: [{ at: "2026-11-20T10:00:00Z", kobo: 1_850_000, method: "cash" }], bookingId: "b1" },
      { id: "s2", at: "2026-11-22T10:00:00Z", name: "Ada Nwosu", item: "Cornrows", totalKobo: 600_000, payments: [{ at: "2026-11-22T10:00:00Z", kobo: 400_000, method: "transfer" }], phone: "0803 111 0011" },
      { id: "s3", at: "2026-11-23T10:00:00Z", name: "Ngozi", item: "Silk press", totalKobo: 900_000, payments: [{ at: "2026-11-23T10:00:00Z", kobo: 900_000, method: "cash" }] },
    ];
    const clients = buildClients({
      bookings: [booking("b1", "+2348031110011", "Ada", "2026-11-20T09:00:00Z", "arrived", 800_000), booking("b2", "+2348031110011", "Ada", "2026-11-28T09:00:00Z", "booked"), booking("b3", "+2348031110012", "Kemi", "2026-11-21T09:00:00Z", "no_show")],
      sales,
      claims: [],
      notes: { "+2348031110011": { notes: "Sensitive scalp" } },
      now,
    });
    const ada = clients.find((c) => c.phone === "+2348031110011")!;
    expect(ada.name).toBe("Ada Nwosu");
    expect(ada.visits).toBe(2);
    expect(ada.spentKobo).toBe(800_000 + 1_850_000 + 400_000);
    expect(ada.owedKobo).toBe(200_000);
    expect(ada.next?.at).toBe("2026-11-28T09:00:00Z");
    expect(ada.lastVisit).toBe("2026-11-22T10:00:00Z");
    expect(ada.note.notes).toBe("Sensitive scalp");
    expect(ada.sources.sort()).toEqual(["booking", "walk_in"]);
    expect(clients.find((c) => c.name === "Kemi")!.noShows).toBe(1);
    const ngozi = clients.find((c) => c.name === "Ngozi")!;
    expect(ngozi.key).toBe("name:ngozi");
    expect(sortClients(clients, "owes").map((c) => c.name)).toEqual(["Ada Nwosu"]);
    expect(sortClients(clients, "spent")[0].name).toBe("Ada Nwosu");
  });

  it("offers matches for walk-ins without a number", () => {
    const clients = buildClients({
      bookings: [booking("b1", "+2348031110011", "Ada Nwosu", "2026-11-20T09:00:00Z", "arrived")],
      sales: [{ id: "s", at: "2026-11-23T10:00:00Z", name: "ada", item: "Silk press", totalKobo: 1, payments: [] }],
      claims: [],
      notes: {},
      now,
    });
    const walkIn = clients.find((c) => !c.phone)!;
    expect(possibleMatches(walkIn, clients).map((c) => c.name)).toEqual(["Ada Nwosu"]);
  });

  it("normalises numbers and says how long ago", () => {
    expect(phoneKey("0803 123 4567")).toBe("+2348031234567");
    expect(phoneKey("+234 803 123 4567")).toBe("+2348031234567");
    expect(phoneKey("12345")).toBeNull();
    expect(relativeDay("2026-11-11T10:00:00Z", now)).toBe("2 weeks ago");
    expect(relativeDay("2026-11-25T08:00:00Z", now)).toBe("today");
  });

  it("offers a pay link for what they owe, a Tikka they haven't used, or something else", () => {
    const sales: Sale[] = [
      { id: "s1", at: "2026-11-20T10:00:00Z", name: "Ada", item: "Knotless braids", totalKobo: 1_850_000, payments: [{ at: "2026-11-20T10:00:00Z", kobo: 1_000_000, method: "cash" }], bookingId: "b1" },
      { id: "s2", at: "2026-11-22T10:00:00Z", name: "Ada", item: "Cornrows", totalKobo: 600_000, payments: [{ at: "2026-11-22T10:00:00Z", kobo: 600_000, method: "cash" }], phone: "08031110011" },
    ];
    const [ada] = buildClients({
      bookings: [booking("b1", "+2348031110011", "Ada", "2026-11-20T09:00:00Z", "arrived")],
      sales,
      claims: [
        { id: "c1", name: "Ada", phone: "08031110011", reward: "20% off braids", claimedAt: "2026-11-23T10:00:00Z" },
        { id: "c2", name: "Ada", phone: "08031110011", reward: "Free wash", claimedAt: "2026-11-01T10:00:00Z", redeemedAt: "2026-11-05T10:00:00Z" },
      ],
      notes: {},
      now,
    });
    const reasons = payLinkReasons(ada);
    expect(reasons).toEqual([
      { kind: "balance", saleId: "s1", title: "Knotless braids", at: "2026-11-20T09:00:00Z", kobo: 850_000 },
      { kind: "tikka", claimId: "c1", reward: "20% off braids", at: "2026-11-23T10:00:00Z" },
      { kind: "other" },
    ]);
    expect(reasons.map(payReasonNote)).toEqual(["Balance for Knotless braids", "20% off braids (your Tikka)", ""]);
  });

  it("tells customers with the same name apart by their number, and finds them however it's typed", () => {
    const sales: Sale[] = [
      { id: "a", at: "2026-11-20T10:00:00Z", name: "Chioma", item: "Cornrows", totalKobo: 600_000, payments: [{ at: "2026-11-20T10:00:00Z", kobo: 600_000, method: "cash" }], phone: "0803 111 0017" },
      { id: "b", at: "2026-11-21T10:00:00Z", name: "Chioma", item: "Cornrows", totalKobo: 600_000, payments: [{ at: "2026-11-21T10:00:00Z", kobo: 600_000, method: "cash" }], phone: "0809 999 0099" },
      { id: "c", at: "2026-11-22T10:00:00Z", name: "Chioma Okafor", item: "Silk press", totalKobo: 900_000, payments: [{ at: "2026-11-22T10:00:00Z", kobo: 900_000, method: "cash" }], phone: "+234 803 111 0017" },
    ];
    const list = buildClients({ bookings: [], sales, claims: [], notes: {}, now });
    expect(list).toHaveLength(2);
    const first = list.find((c) => c.phone === "+2348031110017")!;
    expect([first.name, first.visits, first.spentKobo]).toEqual(["Chioma Okafor", 2, 1_500_000]);
    expect(list.find((c) => c.phone === "+2348099990099")!.visits).toBe(1);
    expect(formatPhone("+2348031110017")).toBe("0803 111 0017");
    expect(phoneTail("+2348031110017")).toBe("…0017");
    expect([...repeatedNames(list)]).toEqual(["chioma"]);
    for (const q of ["0803 111", "803111", "+234 803 111", "chioma ok"]) expect(matchesSearch(first, q)).toBe(true);
    expect(matchesSearch(first, "0809")).toBe(false);
    expect(matchesSearch(first, "")).toBe(true);
  });
});
