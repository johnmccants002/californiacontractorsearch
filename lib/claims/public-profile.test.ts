import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { publicBusinessProfile } from "./public-profile";
import { PublicBusinessDetails } from "../../components/claims/public-details";
const profile = {
  license_id: 1,
  description: "<script>alert('unsafe')</script>",
  website: "javascript:alert(1)",
  contact_phone: "555-0100",
  contact_email: "public@example.com",
  hours: "9–5",
  service_areas: "Sacramento",
  updated_at: "2026-10-31T12:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLAIMS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "admin-secret");
});
afterEach(() => vi.unstubAllEnvs());
describe("optional public owner content", () => {
  it("has no database dependency when disabled", async () => {
    vi.stubEnv("CLAIMS_ENABLED", "false");
    expect(await publicBusinessProfile(1)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not break the authoritative CSLB page when optional enrichment fails", async () => {
    mocks.create.mockImplementation(() => {
      throw new Error("private SDK detail");
    });
    expect(await publicBusinessProfile(1)).toBeNull();
  });
  it("uses only anonymous read permissions with a timeout", async () => {
    const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: profile, error: null }),
      abortSignal = vi.fn().mockReturnValue({ maybeSingle });
    mocks.create.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ abortSignal }) }) }),
    });
    expect(await publicBusinessProfile(1)).toEqual(profile);
    expect(mocks.create).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      "publishable",
      expect.any(Object),
    );
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("escapes owner text, suppresses unsafe URL links, and separates claimed status from CSLB verification", () => {
    const html = renderToStaticMarkup(
      createElement(PublicBusinessDetails, { profile, licenseNumber: "123" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("not a CSLB endorsement");
    expect(html).toContain("self-reported");
    expect(html).toContain("does not change the CSLB source date");
    expect(html).not.toContain("admin-secret");
  });
  it("marks valid business links as user-generated and safe in new tabs", () => {
    const html = renderToStaticMarkup(
      createElement(PublicBusinessDetails, {
        profile: { ...profile, website: "https://example.com" },
        licenseNumber: "123",
      }),
    );
    expect(html).toContain('rel="noopener noreferrer ugc nofollow"');
    expect(html).toContain('href="/claim/123"');
  });
});
