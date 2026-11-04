import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getSessionUser = vi.fn();
vi.mock("./session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
  }),
}));
const { prelaunch, prelaunchAllows, openForThisVisitor } = await import("./launch");

describe("pre-launch mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getSessionUser.mockReset();
  });

  it("is off unless TIKKA_PRELAUNCH=1", () => {
    vi.stubEnv("TIKKA_PRELAUNCH", "");
    expect(prelaunch()).toBe(false);
    vi.stubEnv("TIKKA_PRELAUNCH", "1");
    expect(prelaunch()).toBe(true);
  });

  it("lets admins do everything, the business's team only claim", () => {
    expect(prelaunchAllows({ isAdmin: true, isMember: false }, "claim")).toBe(true);
    expect(prelaunchAllows({ isAdmin: true, isMember: false }, "notify")).toBe(true);
    expect(prelaunchAllows({ isAdmin: false, isMember: true }, "claim")).toBe(true);
    expect(prelaunchAllows({ isAdmin: false, isMember: true }, "notify")).toBe(false);
    expect(prelaunchAllows({ isAdmin: false, isMember: false }, "claim")).toBe(false);
  });

  it("is open to everyone when off, and closed to visitors when on", async () => {
    vi.stubEnv("TIKKA_PRELAUNCH", "");
    getSessionUser.mockResolvedValue(null);
    expect(await openForThisVisitor("claim", "b1")).toBe(true);
    vi.stubEnv("TIKKA_PRELAUNCH", "1");
    expect(await openForThisVisitor("claim", "b1")).toBe(false);
    expect(await openForThisVisitor("notify")).toBe(false);
    getSessionUser.mockResolvedValue({ id: "u1", isAdmin: false });
    expect(await openForThisVisitor("claim", "b1")).toBe(false);
    getSessionUser.mockResolvedValue({ id: "u1", isAdmin: true });
    expect(await openForThisVisitor("claim", "b1")).toBe(true);
  });
});
