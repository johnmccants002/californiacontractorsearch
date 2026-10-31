import { describe, expect, it, vi } from "vitest";
import { resolveLocationInput } from "./location-reference";
import { hasGeoInput } from "./geo";
import { normalizeFilters, readFilterParams, removeFilterHref, searchHref } from "./filters";
import reference from "@/data/locations/census-2025.json";

vi.mock("server-only", () => ({}));

describe("local Census search centers", () => {
  it.each(["Sacramento", " sacramento, ca ", "Sacramento,CA", "Sacramento California", "Sacramento city, CA"])("resolves %s without changing exact address filters", near => {
    expect(resolveLocationInput({ near, city: "Elk Grove", zip: "95758", county: "Sacramento", classification: "c36", status: "ACTIVE" })).toEqual({ near: "Sacramento, CA", lat: "38.567694", lng: "-121.468161", radius: "25", sort: "distance", city: "Elk Grove", zip: "95758", county: "Sacramento", classification: "c36", status: "ACTIVE" });
  });
  it.each(["95814", "10001", "00601"])("resolves mapped ZIP %s without losing leading zeroes", near => {
    const result = resolveLocationInput({ near, radius: "10", sort: "name" });
    expect(result).toMatchObject({ near, radius: "10", sort: "name" });
    expect(Number.isFinite(Number(result.lat))).toBe(true);
    expect(Number.isFinite(Number(result.lng))).toBe(true);
  });
  it("lets an edited place replace old coordinates", () => {
    expect(resolveLocationInput({ near: "95814", lat: "0", lng: "0" })).toMatchObject({ lat: "38.580568", lng: "-121.49559" });
  });
  it.each(["00000", "95814-1234", "9581", "123 Main St, Sacramento", "Sacramnto", "Sacramento, NV", "__proto__", "x".repeat(101)])("fails closed for %s", near => {
    expect(() => resolveLocationInput({ near })).toThrow();
  });
  it("requires a ZIP instead of guessing between duplicate place names", () => {
    expect(() => resolveLocationInput({ near: "Mountain View" })).toThrow("More than one");
  });
  it("validates all bundled reference coordinates and retains a reproducible provenance", () => {
    expect(reference.places.length).toBe(1619);
    expect(Object.keys(reference.zips)).toHaveLength(33791);
    expect(reference.sources).toHaveLength(2);
    expect(reference.sourceSha256.every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    for (const [lat, lng] of [...reference.places.map(row => row.slice(1)), ...Object.values(reference.zips)]) {
      expect(Number.isFinite(lat) && Math.abs(Number(lat)) <= 90 && Number.isFinite(lng) && Math.abs(Number(lng)) <= 180).toBe(true);
    }
  });
  it("keeps friendly centers and distance through pagination, then removes the whole location together", () => {
    const filters = normalizeFilters(resolveLocationInput(readFilterParams({ near: "Sacramento", nearby: "1", classification: "c36", sort: "relevance" })));
    const state = { query: "", filters };
    const url = new URL(searchHref(state, 2), "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ classification: "c36", sort: "distance", near: "Sacramento, CA", radius: "25", page: "2" });
    expect(removeFilterHref(state, "geo")).toBe("/search?classification=c36");
    expect(resolveLocationInput(readFilterParams(Object.fromEntries(url.searchParams)))).toMatchObject({ lat: "38.567694", lng: "-121.468161", radius: "25", sort: "distance" });
    expect(hasGeoInput({ near: "Sacramento" })).toBe(true);
  });
  it("keeps relevance selected after removing a nearby distance-sort chip", () => {
    const state = { query: "", filters: normalizeFilters(resolveLocationInput({ near: "95814" })) };
    const url = new URL(removeFilterHref(state, "sort"), "https://example.test");
    const resolved = resolveLocationInput(readFilterParams(Object.fromEntries(url.searchParams)));
    expect(resolved.sort).toBe("relevance");
    expect(normalizeFilters(resolved).near).toBe("95814");
  });
  it("preserves normal searches and legacy coordinates, and rejects orphan radius input", () => {
    const normal = { city: "Sacramento" }, legacy = { lat: "38.58", lng: "-121.49", radius: "25" };
    expect(resolveLocationInput(normal)).toBe(normal);
    expect(resolveLocationInput(legacy)).toBe(legacy);
    expect(() => resolveLocationInput({ radius: "25" })).toThrow("Choose a city or ZIP");
    expect(() => normalizeFilters(resolveLocationInput({ near: "95814", radius: "251" }))).toThrow();
  });
});
