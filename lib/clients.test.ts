import { describe, expect, it } from "vitest";
import type { Booking } from "./bookings";
import { buildClients, phoneKey, possibleMatches, relativeDay, sortClients } from "./clients";
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
});
