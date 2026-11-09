import { afterEach, describe, expect, it, vi } from "vitest";
import { claimMode, turnstileSiteKey } from "./claim-mode";

vi.mock("server-only", () => ({}));
const { turnstileEnabled, verifyTurnstile } = await import("./turnstile");

describe("claim mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is WhatsApp unless TIKKA_CLAIM_MODE=page", () => {
    vi.stubEnv("TIKKA_CLAIM_MODE", "");
    expect(claimMode()).toBe("whatsapp");
    vi.stubEnv("TIKKA_CLAIM_MODE", "whatsapp");
    expect(claimMode()).toBe("whatsapp");
    vi.stubEnv("TIKKA_CLAIM_MODE", "page");
    expect(claimMode()).toBe("page");
  });

  it("only uses Turnstile when both keys are set", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileSiteKey()).toBeUndefined();
    expect(turnstileEnabled()).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(turnstileSiteKey()).toBe("site");
    expect(turnstileEnabled()).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lets claims through when Turnstile isn't set up", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile(undefined, null)).toBe(true);
  });

  it("needs a token Cloudflare accepts when it is", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    expect(await verifyTurnstile(undefined, null)).toBe(false);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstile("good", "1.2.3.4")).toBe(true);
    const sent = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("good");
    expect(sent.get("remoteip")).toBe("1.2.3.4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    expect(await verifyTurnstile("bad", null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await verifyTurnstile("any", null)).toBe(false);
  });
});
