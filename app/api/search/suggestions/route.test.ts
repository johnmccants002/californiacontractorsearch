import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { searchTypesenseContractors } from "@/lib/typesense/search";
import { demoContractors } from "@/lib/contractors/demo-data";
import { normalizeFilters } from "@/lib/search/filters";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/typesense/search", () => ({ searchTypesenseContractors: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("TYPESENSE_ENABLED", "true"); });
describe("bounded autocomplete endpoint", () => {
  it("returns only the suggestion fields and marks API responses non-indexable", async () => {
    vi.mocked(searchTypesenseContractors).mockResolvedValue({ results: [{ contractor: demoContractors[0], score: 1, matchedBy: [] }], total: 1, page: 1, pageSize: 5, totalPages: 1, source: "supabase", state: { query: "test", filters: normalizeFilters() } });
    const response = await GET(new Request("https://example.test/api/search/suggestions?q=test&city=Sacramento"));
    expect(searchTypesenseContractors).toHaveBeenCalledWith("test", 1, 5, { city: "Sacramento" });
    expect(Object.keys((await response.json()).suggestions[0]).sort()).toEqual(["businessName", "city", "licenseNumber"]);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("degrades quietly on outages without exposing SDK errors", async () => {
    vi.mocked(searchTypesenseContractors).mockRejectedValue(new Error("sensitive-key"));
    const response = await GET(new Request("https://example.test/api/search/suggestions?q=test"));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"suggestions":[]}');
  });
  it("does not run for disabled, short or oversized queries", async () => {
    await GET(new Request("https://example.test/api/search/suggestions?q=a"));
    expect((await GET(new Request(`https://example.test/api/search/suggestions?q=${"a".repeat(201)}`))).status).toBe(400);
    vi.stubEnv("TYPESENSE_ENABLED", "false");
    await GET(new Request("https://example.test/api/search/suggestions?q=test"));
    expect(searchTypesenseContractors).not.toHaveBeenCalled();
  });
});
