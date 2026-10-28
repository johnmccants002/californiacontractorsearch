import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifications, demoContractors } from "@/lib/contractors/demo-data";
import { searchDatabaseContractors as searchContractors } from "@/lib/search/search-contractors";
import type { Contractor, PaginatedResults } from "@/lib/contractors/types";
import { normalizeFilters } from "@/lib/search/filters";
import { getAvailableTradeCityPages, getTradeCityDirectory } from "./trade-city-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search/search-contractors", () => ({ searchDatabaseContractors: vi.fn() }));
const record: Contractor = { ...demoContractors[0], dataSource: "cslb", city: "SACRAMENTO", state: "CA", classifications: classifications.filter((c) => c.code === "c36") };
const results = (contractors: Contractor[] = [record], source: PaginatedResults["source"] = "supabase"): PaginatedResults => ({
  results: contractors.map((contractor) => ({ contractor, score: 1, matchedBy: [] })), source,
  page: 1, pageSize: 20, total: contractors.length, totalPages: 1,
  state: { query: "", filters: normalizeFilters({ classification: "c36", city: "Sacramento", sort: "name" }) },
});
beforeEach(() => vi.resetAllMocks());

describe("curated directory data", () => {
  it("reuses bounded strict search with no fuzzy query or active-only assumption", async () => {
    vi.mocked(searchContractors).mockResolvedValue(results());
    const data = await getTradeCityDirectory("plumbing", "sacramento");
    expect(data?.contractors).toEqual([record]);
    expect(searchContractors).toHaveBeenCalledWith("", 1, 20, { classification: "c36", city: "Sacramento", sort: "name" });
  });
  it("does not query the database for unsupported pairs", async () => {
    expect(await getTradeCityDirectory("plumbing", "los-angeles")).toBeNull();
    expect(searchContractors).not.toHaveBeenCalled();
  });
  it("excludes demo, unknown, wrong-city, wrong-state, and wrong-trade records", async () => {
    vi.mocked(searchContractors).mockResolvedValue(results([
      record, { ...record, dataSource: "demo" }, { ...record, dataSource: "unknown" },
      { ...record, city: "Elk Grove" }, { ...record, state: "TX" }, { ...record, classifications: [] },
    ]));
    expect((await getTradeCityDirectory("plumbing", "sacramento"))?.contractors).toEqual([record]);
  });
  it("does not publish demo or empty pages", async () => {
    vi.mocked(searchContractors).mockResolvedValueOnce(results([record], "demo")).mockResolvedValueOnce(results([]));
    expect(await getTradeCityDirectory("plumbing", "sacramento")).toBeNull();
    expect(await getTradeCityDirectory("plumbing", "sacramento")).toBeNull();
  });
  it("does not hide database outages as successful empty pages", async () => {
    vi.mocked(searchContractors).mockRejectedValue(new Error("Unavailable"));
    await expect(getTradeCityDirectory("plumbing", "sacramento")).rejects.toThrow("Unavailable");
    await expect(getAvailableTradeCityPages()).rejects.toThrow("Unavailable");
  });
  it("only offers populated imported pages to the sitemap", async () => {
    vi.mocked(searchContractors).mockImplementation(async (_q, _page, _size, filters) => filters?.classification === "c36" ? results() : results([]));
    expect((await getAvailableTradeCityPages()).map((page) => page.trade)).toEqual(["plumbing"]);
  });
});
