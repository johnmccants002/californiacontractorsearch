import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { searchLicenseIds } from "./database-search";

vi.mock("server-only", () => ({}));

const catalog = [{ id: 5, code: "c36", name: "Plumbing Contractor", aliases: ["plumbing", "plumber", "plumbers"] }];
const rpcRows = [{ license_id: 99, relevance_score: 800, matched_by: ["exact business name"], total_count: 1 }];

function fakeDatabase(responses: { data: unknown; status?: number; count?: number }[]) {
  const urls: URL[] = [];
  const client = createClient("https://search.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      urls.push(new URL(String(input)));
      const next = responses.shift();
      if (!next) throw new Error("Unexpected database request");
      return new Response(JSON.stringify(next.data), {
        status: next.status ?? 200,
        headers: {
          "content-type": "application/json",
          ...(next.count !== undefined ? { "content-range": `0-9/${next.count}` } : {}),
        },
      });
    } },
  });
  return { client, urls };
}

describe("production database query routing", () => {
  it("does no database work for an empty query", async () => {
    const { client, urls } = fakeDatabase([]);
    expect(await searchLicenseIds(client, "  ", 0, 10)).toEqual({ rows: [], total: 0 });
    expect(urls).toHaveLength(0);
  });

  it.each(["1082303", "C-36", "95814"])("keeps %s on the existing RPC", async (query) => {
    const { client, urls } = fakeDatabase([{ data: rpcRows }]);
    await searchLicenseIds(client, query, 0, 10);
    expect(urls[0].pathname).toContain("/rpc/search_license_ids_v2");
  });

  it("protects exact trade-prefixed business names", async () => {
    const { client, urls } = fakeDatabase([{ data: catalog }, { data: [{ id: 99 }] }, { data: rpcRows }]);
    const result = await searchLicenseIds(client, "Plumbing Sacramento", 0, 10);
    expect(result.interpretation).toBeUndefined();
    expect(urls.at(-1)?.pathname).toContain("/rpc/search_license_ids_v2");
  });

  it("falls back to names when an implicit location is not a known city", async () => {
    const { client, urls } = fakeDatabase([{ data: catalog }, { data: [] }, { data: [] }, { data: rpcRows }]);
    const result = await searchLicenseIds(client, "Plumbing Solutions", 0, 10);
    expect(result.interpretation).toBeUndefined();
    expect(urls.at(-1)?.pathname).toContain("/rpc/search_license_ids_v2");
  });

  it("uses indexed candidates plus strict relational filters and stable pagination", async () => {
    const { client, urls } = fakeDatabase([
      { data: catalog }, { data: [] },
      { data: [{ id: 42, license_status: "ACTIVE" }], count: 255 },
    ]);
    const result = await searchLicenseIds(client, "plumbers in Sacramento", 10, 10);
    expect(result.total).toBe(255);
    expect(result.rows[0].license_id).toBe(42);
    const params = urls.at(-1)!.searchParams;
    expect(params.get("search_vector")).toBe("fts(simple).c36 & sacramento");
    expect(params.get("city")).toBe("ilike.sacramento");
    expect(params.get("license_classifications.classification_id")).toBe("eq.5");
    expect(params.get("select")).toContain("!inner");
    expect(params.get("offset")).toBe("10");
    expect(params.get("limit")).toBe("10");
    expect(params.get("order")).toBe("license_status.asc,business_name_normalized.asc,id.asc");
  });

  it("does not fall back to fuzzy matches when explicit filters return nothing", async () => {
    const { client, urls } = fakeDatabase([{ data: catalog }, { data: [] }, { data: [], count: 0 }]);
    const result = await searchLicenseIds(client, "plumbers in No Such City", 0, 10);
    expect(result.total).toBe(0);
    expect(result.interpretation).toBeDefined();
    expect(urls.some((url) => url.pathname.includes("/rpc/"))).toBe(false);
  });

  it("uses an indexed ZIP prefix prefilter that supports ZIP+4 records", async () => {
    const { client, urls } = fakeDatabase([{ data: catalog }, { data: [] }, { data: [], count: 0 }]);
    await searchLicenseIds(client, "plumbers in 95814", 0, 10);
    expect(urls.at(-1)!.searchParams.get("search_vector")).toBe("fts(simple).c36 & 95814:*");
    expect(urls.at(-1)!.searchParams.get("zip")).toBe("like.95814%");
  });

  it("recovers the count for an out-of-range page without fetching every match", async () => {
    const { client, urls } = fakeDatabase([
      { data: catalog }, { data: [] },
      { status: 416, data: { code: "PGRST103", message: "Requested range not satisfiable" } },
      { data: [{ id: 1, license_status: "ACTIVE" }], count: 255 },
    ]);
    const result = await searchLicenseIds(client, "plumbers in Sacramento", 1000, 10);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(255);
    expect(urls.at(-1)!.searchParams.get("offset")).toBe("0");
    expect(urls.at(-1)!.searchParams.get("limit")).toBe("1");
  });

  it("surfaces database errors instead of hiding them with demo or fuzzy results", async () => {
    const { client } = fakeDatabase([
      { data: catalog }, { data: [] },
      { status: 500, data: { message: "query failed", code: "57014" } },
    ]);
    await expect(searchLicenseIds(client, "plumbers in Sacramento", 0, 10)).rejects.toThrow("query failed");
  });
});
