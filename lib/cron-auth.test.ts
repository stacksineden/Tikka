import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cronAllowed } = await import("./cron-auth");

const req = (auth?: string) => new Request("https://usetikka.com/api/cron/outbound", { headers: auth ? { authorization: auth } : {} });

describe("cron routes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("need the secret when it's set", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(cronAllowed(req("Bearer s3cret"))).toBe(true);
    expect(cronAllowed(req("Bearer nope"))).toBe(false);
    expect(cronAllowed(req())).toBe(false);
  });

  it("refuse everyone in production without a secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(cronAllowed(req())).toBe(false);
    expect(cronAllowed(req("Bearer anything"))).toBe(false);
  });

  it("can be called by hand in development", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(cronAllowed(req())).toBe(true);
  });
});
