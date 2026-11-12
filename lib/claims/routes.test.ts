import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delivery: vi.fn(),
  after: vi.fn(),
}));
vi.mock("./auth", () => ({ createUserClient: mocks.create }));
vi.mock("./notices", () => ({ flushClaimNotices: mocks.delivery }));
vi.mock("next/server", () => ({ after: mocks.after }));
import { POST as account } from "../../app/api/account/route";
import { POST as claims } from "../../app/api/claims/route";
const id = "00000000-0000-4000-8000-000000000001";
const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  mfa: { listFactors: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn() },
};
const rpc = vi.fn(),
  from = vi.fn();
const post = (data: Record<string, unknown>) =>
  new Request("https://example.com/api/account", {
    method: "POST",
    headers: {
      origin: "https://example.com",
      "content-type": "application/json",
    },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLAIMS_ENABLED", "true");
  vi.stubEnv("CLAIMS_SITE_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  mocks.create.mockResolvedValue({ auth, rpc, from });
  auth.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-31" } },
    error: null,
  });
  auth.getClaims.mockResolvedValue({
    data: { claims: { aal: "aal2" } },
    error: null,
  });
  rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("passwordless routes", () => {
  it("passes the CAPTCHA token to Supabase and never reveals a code", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    const result = await account(
      post({
        action: "send-code",
        email: "owner@example.com",
        captcha_token: "challenge",
      }),
    );
    expect(result.status).toBe(200);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: { captchaToken: "challenge", shouldCreateUser: true },
    });
    expect(await result.text()).not.toContain("challenge");
  });
  it("rejects missing CAPTCHA before sending email", async () => {
    expect(
      (await account(post({ action: "send-code", email: "owner@example.com" })))
        .status,
    ).toBe(400);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
  it("handles expired or wrong OTP without exposing auth errors", async () => {
    auth.verifyOtp.mockResolvedValue({
      error: { message: "secret SDK payload" },
    });
    const res = await account(
      post({
        action: "verify-code",
        email: "owner@example.com",
        code: "123456",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("secret");
  });
  it("uses an allowlisted destination after verifying the code", async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    expect(
      await (
        await account(
          post({
            action: "verify-code",
            email: "owner@example.com",
            code: "123456",
            next: "https://evil.example",
          }),
        )
      ).json(),
    ).toEqual({ ok: true, next: "/account" });
  });
  it("does not enroll unverified or non-admin accounts in reviewer MFA", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await account(post({ action: "enroll-mfa" }))).status).toBe(403);
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await account(post({ action: "enroll-mfa" }))).status).toBe(401);
  });
  it("reuses an existing verified authenticator without exposing its secret", async () => {
    auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id }] },
      error: null,
    });
    expect(
      await (await account(post({ action: "enroll-mfa" }))).json(),
    ).toEqual({ ok: true, factorId: id });
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
  it("enrolls a separate reviewer authenticator without granting review access", async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    auth.mfa.enroll.mockResolvedValue({
      data: { id, totp: { secret: "fixture-enrollment-secret" } }, error: null,
    });
    const res = await account(post({ action: "enroll-mfa" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(await res.json()).toEqual({ ok: true, factorId: id, secret: "fixture-enrollment-secret" });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp", friendlyName: "California Contractor Search reviews",
    });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects incorrect TOTP codes without exposing provider details", async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: { message: "private factor details" } });
    const res = await account(post({ action: "verify-mfa", factor_id: id, code: "000000" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Authenticator verification failed");
    expect(from).not.toHaveBeenCalled();
  });
  it("verifies the reviewer factor before returning to the review queue", async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
    const res = await account(post({ action: "verify-mfa", factor_id: id, code: "123456" }));
    expect(await res.json()).toEqual({ ok: true, next: "/admin/claims" });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: id, code: "123456" });
    expect(from).not.toHaveBeenCalled();
  });
});
describe("claim write routes", () => {
  it("requires a verified account before any write", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    expect((await claims(post({ action: "submit" }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("requires admin membership AND MFA for reviews and queue delivery", async () => {
    for (const action of ["review", "deliver-notices"]) {
      rpc.mockResolvedValue({ data: true, error: null });
      auth.getClaims.mockResolvedValue({
        data: { claims: { aal: "aal1" } },
        error: null,
      });
      expect((await claims(post({ action }))).status).toBe(403);
      rpc.mockResolvedValue({ data: false, error: null });
      auth.getClaims.mockResolvedValue({
        data: { claims: { aal: "aal2" } },
        error: null,
      });
      expect((await claims(post({ action }))).status).toBe(403);
    }
    expect(from).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("submits whitelisted fields under the user's RLS client and schedules notifications only after success", async () => {
    const insert = vi
      .fn()
      .mockReturnValue({
        select: () => ({ single: async () => ({ data: { id }, error: null }) }),
      });
    from.mockReturnValue({ insert });
    const result = await claims(
      post({
        action: "submit",
        license_id: 10,
        applicant_name: "Fixture Owner",
        applicant_role: "owner",
        attested: true,
        status: "approved",
        user_id: "attacker",
      }),
    );
    expect(result.status).toBe(201);
    expect(insert.mock.calls[0][0]).not.toHaveProperty("status");
    expect(insert.mock.calls[0][0]).not.toHaveProperty("user_id");
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
  it("does not send notices after a rejected database write", async () => {
    from.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: { code: "23505", message: "raw private details" },
          }),
        }),
      }),
    });
    const result = await claims(
      post({
        action: "submit",
        license_id: 10,
        applicant_name: "Fixture Owner",
        applicant_role: "owner",
        attested: true,
      }),
    );
    expect(result.status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain("raw private");
  });
  it("rejects cross-origin writes before touching the auth client", async () => {
    const req = post({ action: "submit" });
    req.headers.set("origin", "https://evil.example");
    expect((await claims(req)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
