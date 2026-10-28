import { describe, expect, it, vi } from "vitest";
import { normalizeFilters, readFilterParams, removeFilterHref, searchHref } from "@/lib/search/filters";
import { distanceMiles } from "@/lib/search/geo";
import { classifications } from "@/lib/contractors/demo-data";
import { indexFilters, searchIndex, type IndexSearch } from "./query";
import { contractorSchema, GEO_SCHEMA_VERSION, indexSelect, mapIndexDocument, type IndexRow } from "./schema";
import { prepareAddress } from "@/lib/geocoding/address";

describe("geographic filtering and sorting", () => {
  it("combines bounded radius with existing location, status, and classification filters", async () => {
    const search = vi.fn<IndexSearch>().mockResolvedValue({ found: 0, hits: [] });
    const result = await searchIndex(search, "plumbing", 2, 10, { lat: "38.58", lng: "-121.49", radius: "25", city: "Sacramento", county: "Sacramento", zip: "95814", status: "ACTIVE", sort: "distance" }, classifications);
    expect(indexFilters(result.state)).toBe("record_kind:=contractor && classification_codes:=`c36` && city:=`sacramento` && county:=`sacramento` && zip:=95814 && license_status:=ACTIVE && has_location:=true && location:(38.58, -121.49, 25 mi)");
    expect(search.mock.lastCall![0]).toMatchObject({ sort_by: "location(38.58, -121.49):asc,license_id:asc", page: 2 });
  });
  it.each([{ lat: "38" }, { lat: "abc", lng: "-121" }, { lat: "38", lng: "999" }, { lat: "38", lng: "-121", radius: "0" }, { lat: "38", lng: "-121", radius: "251" }, { sort: "distance" }])("rejects invalid geographic input", (input) => {
    expect(() => normalizeFilters(input)).toThrow();
  });
  it("preserves location across pagination and removes the complete constraint together", () => {
    const input = { lat: "38.58", lng: "-121.49", radius: "25", sort: "distance" };
    const state = { query: "", filters: normalizeFilters(readFilterParams(input)) };
    expect(searchHref(state, 2)).toBe("/search?sort=distance&lat=38.58&lng=-121.49&radius=25&page=2");
    expect(removeFilterHref(state, "geo")).toBe("/search");
    expect(distanceMiles(state.filters.geo!, [38.58, -121.49])).toBe(0);
    expect(distanceMiles({ latitude: 0, longitude: 0 }, [0, 1])).toBeCloseTo(69.093, 2);
  });
  it("uses an optional geopoint only for a geo-enabled collection", () => {
    expect(contractorSchema("plain").fields.some((f) => f.name === "location")).toBe(false);
    expect(indexSelect(false)).not.toContain("latitude");
    expect(contractorSchema("geo", true)).toMatchObject({ metadata: { ccs_schema_version: GEO_SCHEMA_VERSION }, fields: expect.arrayContaining([{ name: "location", type: "geopoint", optional: true }]) });
  });
  it("syncs only current accepted coordinates and explicitly clears old coordinates", () => {
    const row: IndexRow = { id: 99, license_number: "1234567", business_name: "Geo Fixture", license_status: "ACTIVE", city: "Sacramento", county: "Sacramento", state: "CA", zip: "95814", address_line_1: "123 Main St", address_line_2: null, issue_date: null, updated_at: "2026-10-27", source_updated_at: null, source_status: "Clear", personnel: [], license_classifications: [], latitude: 38.58, longitude: -121.49, geocode_status: "accepted", geocode_source: "us_census", geocode_benchmark: "Public_AR_Current", geocoded_at: "2026-10-27T00:00:00Z" };
    row.geocode_address_hash = prepareAddress({ ...row, address_line_1: row.address_line_1! }).hash;
    row.geocode_quality = "exact"; row.geocode_matched_address = "123 MAIN ST";
    expect(mapIndexDocument(row, 0, true)).toMatchObject({ id: "99", has_location: true, location: [38.58, -121.49] });
    expect(mapIndexDocument({ ...row, address_line_1: "456 New Street" }, 0, true)).toMatchObject({ has_location: false, location: null });
    expect(mapIndexDocument({ ...row, geocode_status: "ambiguous" }, 0, true)).toMatchObject({ has_location: false, location: null });
    expect(mapIndexDocument(row)).not.toHaveProperty("location");
  });
});
