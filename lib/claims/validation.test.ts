import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimInput,
  profileInput,
  reviewInput,
  safeNext,
  website,
} from "./validation";
import { claimBody, claimError, claimResponse } from "./http";
import { userSupabaseConfig, claimsOrigin } from "./config";
afterEach(() => vi.unstubAllEnvs());
describe("claim boundary validation", () => {
  it.each([
    "//evil.example",
    "https://evil.example",
    "/account?next=evil",
    "/admin/claims/evil",
    "/claim/1/..",
    "javascript:alert(1)",
  ])("rejects redirect %s", (value) =>
    expect(safeNext(value)).toBe("/account"),
  );
  it.each(["/claim/1082303", "/admin/claims", "/account"])(
    "allows local destination %s",
    (value) => expect(safeNext(value)).toBe(value),
  );
  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "https://a:b@example.com",
    "https://example.com\\@evil.com",
    "https://example.com/\n",
    "https://example.com/<script>",
  ])("rejects unsafe website %s", (value) => {
    // Leading/trailing whitespace is trimmed; embedded control characters remain forbidden.
    if (value.endsWith("\n")) value = "https://example.com/\nmalicious";
    expect(() => website(value)).toThrow();
  });
  it("whitelists claim input and never accepts owner IDs or approval", () => {
    expect(
      claimInput({
        license_id: 10,
        applicant_name: "Owner Name",
        applicant_role: "owner",
        attested: true,
        user_id: "attacker",
        status: "approved",
        reviewed_by: "attacker",
      }),
    ).toEqual({
      license_id: 10,
      applicant_name: "Owner Name",
      applicant_role: "owner",
      attested: true,
      website: "",
    });
  });
  it("requires attestation and public-content consent", () => {
    expect(() => claimInput({})).toThrow();
    expect(() => profileInput({ description: "Hi" })).toThrow();
  });
  it("allows empty optional public fields without changing imported facts", () => {
    expect(
      profileInput({
        public_consent: true,
        license_status: "ACTIVE",
        business_name: "Fake",
      }),
    ).toEqual({
      description: "",
      website: "",
      contact_phone: "",
      contact_email: "",
      hours: "",
      service_areas: "",
    });
  });
  it("requires independent evidence for approval and confirmation for every decision", () => {
    expect(() =>
      reviewInput({
        status: "approved",
        confirmed: true,
        review_note: "Evidence of authority recorded",
      }),
    ).toThrow();
    expect(() =>
      reviewInput({
        status: "revoked",
        review_note: "Evidence of authority recorded",
      }),
    ).toThrow();
    expect(
      reviewInput({
        status: "denied",
        confirmed: true,
        review_note: "Unable to establish business authority",
      }).status,
    ).toBe("denied");
  });
  it("never uses a service role as the user client key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    expect(() => userSupabaseConfig()).toThrow("not configured");
  });
  it("rejects a privileged key accidentally placed in the public-key setting", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    for(const key of ["sb_secret_fixture", `header.${Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")}.signature`]) {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",key);
      expect(()=>userSupabaseConfig()).toThrow("public account client key");
    }
  });
  it.each([
    "http://evil.com",
    "https://example.com/path",
    "https://a:b@example.com",
    "https://example.com?redirect=evil",
  ])("rejects unsafe configured origin %s", (origin) => {
    vi.stubEnv("CLAIMS_SITE_URL", origin);
    expect(() => claimsOrigin()).toThrow();
  });
});
describe("request security", () => {
  const request = (
    data: string,
    origin = "https://example.com",
    type = "application/json",
  ) =>
    new Request("https://example.com/api/claims", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": type },
      body: data,
    });
  function enable() {
    vi.stubEnv("CLAIMS_ENABLED", "true");
    vi.stubEnv("CLAIMS_SITE_URL", "https://example.com");
  }
  it("requires both the feature flag and exact same origin", async () => {
    vi.stubEnv("CLAIMS_ENABLED", "false");
    await expect(claimBody(request("{}"))).rejects.toThrow("not available");
    enable();
    await expect(
      claimBody(request("{}", "https://evil.example")),
    ).rejects.toThrow("Reload");
    await expect(claimBody(request("{}", ""))).rejects.toThrow("Reload");
    expect(await claimBody(request('{"action":"submit"}'))).toEqual({
      action: "submit",
    });
  });
  it("rejects form posts, arrays, malformed JSON and oversized chunked requests", async () => {
    enable();
    await expect(
      claimBody(request("{}", "https://example.com", "text/plain")),
    ).rejects.toThrow();
    for (const body of [
      "[]",
      "null",
      "{",
      JSON.stringify({ payload: "a".repeat(17000) }),
    ])
      await expect(claimBody(request(body))).rejects.toThrow();
  });
  it("marks responses private/noindex and suppresses SDK diagnostics", async () => {
    expect(claimResponse({ ok: true }).headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(claimResponse({}).headers.get("x-robots-tag")).toBe(
      "noindex, nofollow",
    );
    const error = claimError(new Error("private token or raw SDK response"));
    expect(error.status).toBe(503);
    expect(await error.text()).not.toContain("private token");
  });
});
