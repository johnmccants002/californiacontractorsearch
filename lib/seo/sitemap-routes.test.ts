import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as index } from "@/app/sitemap.xml/route";
import { GET as shard } from "@/app/sitemaps/[name]/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDatasetSource } from "@/lib/contractors/repository";
import { getLicenseSitemapEntries, getSitemapBounds } from "./sitemap-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/contractors/repository", () => ({ getDatasetSource: vi.fn() }));
vi.mock("./sitemap-data", () => ({ getLicenseSitemapEntries: vi.fn(), getSitemapBounds: vi.fn() }));

const request = new Request("https://californiacontractorsearch.com/sitemaps/pages.xml");
const params = (name: string) => ({ params: Promise.resolve({ name }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createServerSupabaseClient).mockReturnValue({} as NonNullable<ReturnType<typeof createServerSupabaseClient>>);
  vi.mocked(getSitemapBounds).mockResolvedValue({ first: 0, last: 2 });
});

describe("sitemap HTTP behavior", () => {
  it("serves a cacheable XML index", async () => {
    const result = await index();
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("application/xml");
    expect(result.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(await result.text()).toContain("licenses-2.xml");
  });
  it("uses an uncached retryable failure instead of a partial or demo index", async () => {
    vi.mocked(getSitemapBounds).mockRejectedValue(new Error("private database detail"));
    const result = await index();
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("retry-after")).toBe("300");
    expect(await result.text()).not.toContain("private database detail");
  });
  it("exports no contractor URLs in demo mode", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(null);
    vi.mocked(getDatasetSource).mockResolvedValue("demo");
    expect(await (await index()).text()).not.toContain("licenses-");
    expect(await (await shard(request, params("pages.xml"))).text()).not.toContain("<url>");
    expect((await shard(request, params("licenses-0.xml"))).status).toBe(404);
  });
  it.each(["licenses--1.xml", "licenses-01.xml", "licenses-1.5.xml", "licenses-9999999999.xml", "bad.xml", "licenses-3.xml"])("rejects invalid or out-of-range request %s", async (name) => {
    expect((await shard(request, params(name))).status).toBe(404);
    expect(getLicenseSitemapEntries).not.toHaveBeenCalled();
  });
  it("does not return partial XML after a shard failure", async () => {
    vi.mocked(getLicenseSitemapEntries).mockRejectedValue(new Error("failed"));
    expect((await shard(request, params("licenses-1.xml"))).status).toBe(503);
  });
  it("does not cache dataset outages as an empty pages sitemap", async () => {
    vi.mocked(getDatasetSource).mockResolvedValue("unavailable");
    expect((await shard(request, params("pages.xml"))).status).toBe(503);
  });
});
