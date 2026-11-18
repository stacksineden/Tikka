import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sent: { endpoint: string; body: unknown }[] = [];
const rpc = vi.fn();
const fail = new Map<string, number>();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => {
      const status = fail.get(sub.endpoint);
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
      sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
    }),
  },
}));
vi.mock("./supabase/admin", () => ({ adminClient: () => ({ rpc }) }));
vi.mock("./supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const ALERT = {
  business_name: "Glow Studio",
  drop_id: "d1",
  first_name: "Adaeze",
  tier: "rare",
  reward: "20% off any service",
  recent: 1,
  subscriptions: [
    { endpoint: "https://push.example/a", p256dh: "p", auth: "a" },
    { endpoint: "https://push.example/gone", p256dh: "p", auth: "a" },
  ],
};

describe("sendLeadAlert", () => {
  beforeEach(() => {
    sent.length = 0;
    fail.clear();
    rpc.mockReset();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:hello@usetikka.com";
  });

  it("sends the alert to each phone, one tag per drop, and forgets a phone that's gone", async () => {
    const { sendLeadAlert } = await import("./push");
    fail.set("https://push.example/gone", 410);
    rpc.mockImplementation(async (fn: string) => (fn === "lead_alert" ? { data: ALERT } : { data: null }));
    await sendLeadAlert("view-token");
    expect(sent).toEqual([
      {
        endpoint: "https://push.example/a",
        body: { title: "New lead · Glow Studio", body: "Adaeze just claimed a Rare Tikka: 20% off any service. Tap to message them.", tag: "lead-d1", url: "/app/leads" },
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("forget_push_endpoint", { p_endpoint: "https://push.example/gone" });
  });

  it("never throws, and sends nothing without keys", async () => {
    const { sendLeadAlert } = await import("./push");
    rpc.mockRejectedValue(new Error("database down"));
    await expect(sendLeadAlert("view-token")).resolves.toBeUndefined();
    delete process.env.VAPID_PRIVATE_KEY;
    rpc.mockReset();
    await sendLeadAlert("view-token");
    expect(rpc).not.toHaveBeenCalled();
  });
});
