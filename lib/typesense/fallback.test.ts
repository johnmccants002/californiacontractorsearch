import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchContractors, searchDatabaseContractors } from "@/lib/search/search-contractors";
import { searchTypesenseContractors } from "./search";
import { searchContractorsFromDatabase } from "@/lib/contractors/repository";
import { normalizeFilters, SearchInputError } from "@/lib/search/filters";
vi.mock("server-only", () => ({}));
vi.mock("./search", () => ({ searchTypesenseContractors: vi.fn() }));
vi.mock("@/lib/contractors/repository", () => ({ searchContractorsFromDatabase: vi.fn(), getAllContractors: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TYPESENSE_ENABLED", "true");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(searchContractorsFromDatabase).mockResolvedValue({ results: [], total: 0, state: { query: "x", filters: normalizeFilters() } });
});
describe("optional index and database fallback", () => {
  it("falls back with the same query, pagination, and filters on outages", async () => {
    vi.mocked(searchTypesenseContractors).mockRejectedValue(new Error("private key should never be logged"));
    await searchContractors("1 Demolition", 2, 10, { city: "El Cerrito" });
    expect(searchContractorsFromDatabase).toHaveBeenCalledWith("1 Demolition", 10, 10, { city: "El Cerrito" }, undefined);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("private key"));
  });
  it("does not silently remove a county constraint on failure", async () => {
    vi.mocked(searchTypesenseContractors).mockRejectedValue(new Error("outage"));
    await expect(searchContractors("", 1, 10, { county: "Sacramento" })).rejects.toThrow("County filtering");
    expect(searchContractorsFromDatabase).not.toHaveBeenCalled();
  });
  it("does not silently drop radius constraints or distance sorting during fallback", async () => {
    vi.mocked(searchTypesenseContractors).mockRejectedValue(new Error("outage"));
    await expect(searchContractors("", 1, 10, { lat: "38.58", lng: "-121.49", radius: "25", sort: "distance" })).rejects.toThrow("Location search");
    expect(searchContractorsFromDatabase).not.toHaveBeenCalled();
  });
  it("keeps validation errors out of fallback", async () => {
    vi.mocked(searchTypesenseContractors).mockRejectedValue(new SearchInputError("Invalid input"));
    await expect(searchContractors("x")).rejects.toThrow("Invalid input");
    expect(searchContractorsFromDatabase).not.toHaveBeenCalled();
  });
  it("keeps SEO directory reads independent even when the feature flag is on", async () => {
    await searchDatabaseContractors("", 1, 20, { classification: "c36", city: "Sacramento" });
    expect(searchTypesenseContractors).not.toHaveBeenCalled();
  });
  it("never contacts Typesense when disabled", async () => {
    vi.stubEnv("TYPESENSE_ENABLED", "false");
    await searchContractors("1 Demolition");
    expect(searchTypesenseContractors).not.toHaveBeenCalled();
  });
  it("keeps legitimate zero results empty instead of broadening with the database", async () => {
    vi.mocked(searchTypesenseContractors).mockResolvedValue({ source: "supabase", engine: "typesense", total: 0, results: [], page: 1, pageSize: 10, totalPages: 1, state: { query: "nonexistent", filters: normalizeFilters() } });
    expect((await searchContractors("nonexistent")).total).toBe(0);
    expect(searchContractorsFromDatabase).not.toHaveBeenCalled();
  });
});
