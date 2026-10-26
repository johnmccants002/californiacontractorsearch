import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { searchLicenseIds } from "./database-search";

vi.mock("server-only", () => ({}));
const catalog = [{ id: 5, code: "c36", name: "Plumbing Contractor", aliases: ["plumbing", "plumber", "plumbers"] }];
const result = { rows: [{ license_id: 99, relevance_score: 800, matched_by: ["exact business name"] }], total: 255 };

function fakeDatabase(responses: { data: unknown; status?: number }[]) {
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  const client = createClient("https://search.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), body: init?.body ? JSON.parse(String(init.body)) : {} });
      const next = responses.shift();
      if (!next) throw new Error("Unexpected database request");
      return new Response(JSON.stringify(next.data), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
    } },
  });
  return { client, requests };
}

describe("production database query routing", () => {
  it("does not enumerate licenses for an empty search", async () => {
    const { client, requests } = fakeDatabase([]);
    expect(await searchLicenseIds(client, " ", 0, 10)).toMatchObject({ rows: [], total: 0 });
    expect(requests).toHaveLength(0);
  });

  it.each(["1082303", "C-36", "95814"])("preserves %s as a text/license lookup", async (query) => {
    const { client, requests } = fakeDatabase([{ data: result }]);
    await searchLicenseIds(client, query, 0, 10);
    expect(requests[0].url.pathname).toContain("/rpc/search_license_ids_v3");
    expect(requests[0].body.search_query).toBe(query);
  });

  it("protects an exact trade-prefixed business name", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: [{ id: 99 }] }, { data: result }]);
    const found = await searchLicenseIds(client, "Plumbing Sacramento", 0, 10);
    expect(found.state.query).toBe("Plumbing Sacramento");
    expect(requests.at(-1)!.body.classification_filter).toBe("");
  });

  it("keeps an unknown implicit city as a business lookup", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: [] }, { data: [] }, { data: result }]);
    await searchLicenseIds(client, "Plumbing Solutions", 0, 10);
    expect(requests.at(-1)!.body.search_query).toBe("Plumbing Solutions");
  });

  it("converts natural-language terms to editable filters before pagination", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: [] }, { data: result }]);
    const found = await searchLicenseIds(client, "plumbers in Sacramento", 10, 10);
    expect(found.total).toBe(255);
    expect(found.state).toMatchObject({ query: "", filters: { classification: "c36", city: "sacramento", status: "" } });
    expect(requests.at(-1)!.body).toMatchObject({ search_query: "", classification_filter: "c36", city_filter: "sacramento", result_offset: 10, result_limit: 10 });
  });

  it("explicit fields override inferred fields, including clearing a selection", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: [] }, { data: result }]);
    await searchLicenseIds(client, "plumbers in Sacramento", 0, 10, { city: "Roseville", classification: "", status: "ACTIVE", sort: "name" });
    expect(requests.at(-1)!.body).toMatchObject({ search_query: "", classification_filter: "", city_filter: "roseville", status_filter: "ACTIVE", sort_order: "name" });
  });

  it("supports filter-only searches with a typed trade alias", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: result }]);
    await searchLicenseIds(client, "", 0, 10, { classification: "plumbing", zip: "95814" });
    expect(requests.at(-1)!.body).toMatchObject({ search_query: "", classification_filter: "c36", zip_filter: "95814" });
  });

  it("does not broaden an explicitly empty location result", async () => {
    const { client, requests } = fakeDatabase([{ data: catalog }, { data: [] }, { data: { rows: [], total: 0 } }]);
    const found = await searchLicenseIds(client, "plumbers in No Such City", 0, 10);
    expect(found.total).toBe(0);
    expect(found.interpretation).toBeDefined();
    expect(requests).toHaveLength(3);
  });

  it("preserves the total even when the requested page is empty", async () => {
    const { client } = fakeDatabase([{ data: { rows: [], total: 255 } }]);
    expect(await searchLicenseIds(client, "", 500, 10, { status: "ACTIVE" })).toMatchObject({ rows: [], total: 255 });
  });

  it("surfaces database failures", async () => {
    const { client } = fakeDatabase([{ status: 500, data: { code: "57014", message: "query failed" } }]);
    await expect(searchLicenseIds(client, "1082303", 0, 10)).rejects.toThrow("query failed");
  });
});
