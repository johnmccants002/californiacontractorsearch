import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchTypesenseContractors } from "./search";
import { createTypesenseSearchClient } from "./client";
import { searchIndex } from "./query";
import { getContractorsByIds } from "@/lib/contractors/repository";
import { classifications, demoContractors } from "@/lib/contractors/demo-data";
import { normalizeFilters } from "@/lib/search/filters";
import { SCHEMA_VERSION, GEO_SCHEMA_VERSION } from "./schema";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ createTypesenseSearchClient: vi.fn() }));
vi.mock("./query", () => ({ searchIndex: vi.fn() }));
vi.mock("@/lib/contractors/repository", () => ({ getContractorsByIds: vi.fn(), getSearchClassifications: vi.fn() }));

const remote = vi.fn();
const contractor = { ...demoContractors[0], dataSource: "cslb" as const, county: "Sacramento" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CENSUS_GEOCODING_ENABLED", "false");
  vi.mocked(createTypesenseSearchClient).mockReturnValue({ collection: "test", client: { collections: () => ({ documents: () => ({ search: remote }) }) } } as unknown as ReturnType<typeof createTypesenseSearchClient>);
  remote.mockResolvedValue({ hits: [{ document: { ready: true, schema_version: SCHEMA_VERSION } }] });
  vi.mocked(searchIndex).mockResolvedValue({ total: 1, state: { query: "ABC", filters: normalizeFilters() }, results: [
    { document: { license_id: contractor.id, business_name: contractor.businessName }, highlight: { business_name: { matched_tokens: ["ABC"] } } },
  ] } as unknown as Awaited<ReturnType<typeof searchIndex>>);
  vi.mocked(getContractorsByIds).mockResolvedValue([contractor]);
});

describe("source-validated search adapter", () => {
  it("refuses incomplete and incompatible indexes", async () => {
    for (const document of [{ ready: false, schema_version: SCHEMA_VERSION }, { ready: true, schema_version: -1 }]) {
      remote.mockResolvedValue({ hits: [{ document }] });
      await expect(searchTypesenseContractors("ABC", 1, 10, {}, classifications)).rejects.toThrow("not ready");
    }
    expect(searchIndex).not.toHaveBeenCalled();
    expect(getContractorsByIds).not.toHaveBeenCalled();
  });
  it("returns source records rather than trusting index display data", async () => {
    const result = await searchTypesenseContractors("ABC", 1, 10, {}, classifications);
    expect(getContractorsByIds).toHaveBeenCalledWith([contractor.id]);
    expect(result.results[0]).toMatchObject({ contractor, highlightTokens: ["ABC"] });
    expect(result.engine).toBe("typesense");
  });
  it("rejects deleted and non-CSLB source records", async () => {
    for (const records of [[], [{ ...contractor, dataSource: "demo" as const }]]) {
      vi.mocked(getContractorsByIds).mockResolvedValue(records);
      await expect(searchTypesenseContractors("ABC", 1, 10, {}, classifications)).rejects.toThrow("out of sync");
    }
  });
  it("rejects stale names and filter matches so callers can fall back", async () => {
    vi.mocked(getContractorsByIds).mockResolvedValue([{ ...contractor, businessName: "Renamed Contractor" }]);
    await expect(searchTypesenseContractors("ABC", 1, 10, {}, classifications)).rejects.toThrow("out of sync");
    vi.mocked(getContractorsByIds).mockResolvedValue([contractor]);
    const data = await searchIndex(remote, "ABC", 1, 10, {}, classifications);
    vi.mocked(searchIndex).mockResolvedValue({ ...data, state: { query: "ABC", filters: normalizeFilters({ county: "Fresno" }) } });
    await expect(searchTypesenseContractors("ABC", 1, 10, {}, classifications)).rejects.toThrow("out of sync");
  });
  it("requires an explicit geo flag and a ready geo schema", async () => {
    const input = { lat: "38.58", lng: "-121.49", radius: "25" };
    await expect(searchTypesenseContractors("ABC", 1, 10, input, classifications)).rejects.toThrow("not enabled");
    expect(createTypesenseSearchClient).not.toHaveBeenCalled();
    vi.stubEnv("CENSUS_GEOCODING_ENABLED", "true");
    await expect(searchTypesenseContractors("ABC", 1, 10, input, classifications)).rejects.toThrow("not ready");
  });
  it("checks coordinates against the source before returning distance results", async () => {
    vi.stubEnv("CENSUS_GEOCODING_ENABLED", "true");
    remote.mockResolvedValue({ hits: [{ document: { ready: true, schema_version: GEO_SCHEMA_VERSION } }] });
    const input = { lat: "38.58", lng: "-121.49", radius: "25", sort: "distance" };
    const data = await searchIndex(remote, "ABC", 1, 10, {}, classifications);
    vi.mocked(searchIndex).mockResolvedValue({ ...data, interpretation: undefined, state: { query: "ABC", filters: normalizeFilters(input) },
      results: data.results.map((r) => ({ ...r, document: { ...r.document, location: [38.58, -121.49] } })) });
    vi.mocked(getContractorsByIds).mockResolvedValue([{ ...contractor, registeredLocation: [38.58, -121.49] }]);
    expect((await searchTypesenseContractors("ABC", 1, 10, input, classifications)).results[0].distanceMiles).toBe(0);
    for (const location of [undefined, [38.59, -121.49] as [number, number]]) {
      vi.mocked(getContractorsByIds).mockResolvedValue([{ ...contractor, registeredLocation: location }]);
      await expect(searchTypesenseContractors("ABC", 1, 10, input, classifications)).rejects.toThrow("locations are out of sync");
    }
  });
});
