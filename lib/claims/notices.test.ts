import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  send: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("../refresh/notifications", () => ({
  sendEmailMessage: mocks.send,
  emailConfig: mocks.config,
}));
import { claimNoticeMessage, flushClaimNotices } from "./notices";
const id = "00000000-0000-4000-8000-000000000001";
const rpc = vi.fn(),
  updates: Record<string, unknown>[] = [];
function query(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    abortSignal: async () => result,
  };
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  updates.length = 0;
  vi.stubEnv("CLAIMS_EMAIL_ENABLED", "true");
  vi.stubEnv("CLAIMS_SITE_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
  vi.stubEnv("CLAIMS_ADMIN_EMAIL", "admin@example.com");
  mocks.config.mockImplementation((env) => ({ to: env.CSLB_ALERT_TO }));
  mocks.send.mockResolvedValue(undefined);
  rpc.mockReturnValue({
    abortSignal: async () => ({
      data: [
        {
          id,
          kind: "approved",
          recipient: "owner@example.com",
          created_at: "2026-10-31",
        },
      ],
      error: null,
    }),
  });
  mocks.create.mockReturnValue({
    rpc,
    from: () => ({
      ...query({ data: [{ id }], error: null }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return query({ data: [{ id }], error: null });
      },
    }),
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("private claim notifications", () => {
  it("does nothing until delivery is explicitly enabled", async () => {
    vi.stubEnv("CLAIMS_EMAIL_ENABLED", "false");
    expect((await flushClaimNotices()).configured).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reserves before delivery, then records explicit success", async () => {
    expect(await flushClaimNotices(id)).toEqual({
      configured: true,
      sent: 1,
      review: 0,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_business_claim_notice", {
      target: id,
    });
    expect(mocks.send).toHaveBeenCalledWith(
      { to: "owner@example.com" },
      `ccs-claim-${id}`,
      "2026-10-31",
      expect.objectContaining({ text: expect.stringContaining("/account") }),
    );
    expect(updates[0].state).toBe("sent");
  });
  it("never sends an already-reserved message", async () => {
    rpc.mockReturnValue({
      abortSignal: async () => ({ data: [], error: null }),
    });
    expect((await flushClaimNotices()).sent).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("marks ambiguous SMTP errors for manual review without an automatic retry", async () => {
    mocks.send.mockRejectedValue(new Error("secret raw SMTP reply"));
    expect(await flushClaimNotices()).toEqual({
      configured: true,
      sent: 0,
      review: 1,
    });
    expect(updates).toEqual([{ state: "review" }]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("checks configuration before reserving mail", async () => {
    mocks.config.mockImplementation(() => {
      throw new Error("unconfigured");
    });
    await expect(flushClaimNotices()).rejects.toThrow("unconfigured");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    "submitted_admin",
    "submitted_user",
    "approved",
    "denied",
    "revoked",
    "access_requested",
  ])("renders a safe informational %s notice", (kind) => {
    const result = claimNoticeMessage(kind, "https://example.com");
    expect(result.text).not.toContain("?approve");
    expect(result.text).not.toContain("review_note");
    expect(result.text).toContain("independent of CSLB");
  });
});
