import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
import { proxy, config } from "../../proxy";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLAIMS_ENABLED", "true");
  vi.stubEnv("CLAIMS_SITE_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
});
afterEach(() => vi.unstubAllEnvs());
describe("account proxy", () => {
  it("does not add auth to public search/profile routes", () => {
    expect(
      config.matcher.some(
        (x) => x.startsWith("/search") || x.startsWith("/license"),
      ),
    ).toBe(false);
  });
  it("makes disabled responses private and never contacts Auth", async () => {
    vi.stubEnv("CLAIMS_ENABLED", "false");
    const res = await proxy(new NextRequest("https://example.com/account"));
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves refresh cookies on both downstream request and final response", async () => {
    mocks.create.mockImplementation((_url, _key, options) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll(
            [
              {
                name: "session",
                value: "fresh",
                options: {
                  httpOnly: true,
                  sameSite: "lax",
                  secure: true,
                  path: "/",
                },
              },
            ],
            { "Cache-Control": "private, no-store" },
          );
        },
      },
    }));
    const request = new NextRequest("https://example.com/account"),
      res = await proxy(request);
    expect(request.cookies.get("session")?.value).toBe("fresh");
    expect(res.cookies.get("session")?.value).toBe("fresh");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("fails closed and hides raw SDK errors", async () => {
    mocks.create.mockImplementation(() => {
      throw new Error("secret SDK error");
    });
    const res = await proxy(new NextRequest("https://example.com/account"));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret");
  });
});
