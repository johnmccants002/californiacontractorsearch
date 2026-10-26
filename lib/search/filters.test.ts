import { describe, expect, it } from "vitest";
import { classifications, demoContractors } from "@/lib/contractors/demo-data";
import { clearFiltersHref, normalizeFilters, readFilterParams, removeFilterHref, resolveSearchState, searchHref, validateClassification } from "./filters";
import { parseTradeLocation } from "./trade-location";
import { searchDemoContractors } from "./demo-search";

describe("search filter state", () => {
  it("defaults to any status and relevance", () => {
    expect(normalizeFilters()).toEqual({ classification: "", city: "", zip: "", status: "", sort: "relevance" });
  });
  it("normalizes codes, case, and whitespace", () => {
    expect(normalizeFilters({ classification: "C-36", city: " El Cerrito ", status: "active", zip: " 94530 " })).toMatchObject({ classification: "c36", city: "el cerrito", status: "ACTIVE", zip: "94530" });
  });
  it.each([{ zip: "95" }, { zip: "95%14" }, { status: "VALID" }, { sort: "random" }])("rejects invalid filter %j", (input) => {
    expect(() => normalizeFilters(input)).toThrow();
  });
  it("rejects unknown classifications rather than silently broadening", () => {
    expect(() => validateClassification({ classification: "C-999" }, classifications)).toThrow();
    expect(validateClassification({ classification: "Plumber" }, classifications).classification).toBe("c36");
  });
  it("explicit blank values remove inferred constraints", () => {
    const intent = parseTradeLocation("plumbers in Sacramento", classifications);
    const state = resolveSearchState("plumbers in Sacramento", { city: "", zip: undefined }, intent);
    expect(state.query).toBe("");
    expect(state.filters).toMatchObject({ city: "", classification: "c36" });
  });
  it("keeps every filter in pagination URLs", () => {
    const state = resolveSearchState("A & B", { classification: "c36", city: "El Cerrito", zip: "94530", status: "ACTIVE", sort: "name" });
    const url = new URL(searchHref(state, 3), "https://example.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "A & B", classification: "c36", city: "el cerrito", zip: "94530", status: "ACTIVE", sort: "name", page: "3" });
    expect(new URL(removeFilterHref(state, "city"), url).searchParams.has("city")).toBe(false);
    expect(new URL(removeFilterHref(state, "city"), url).searchParams.has("page")).toBe(false);
    expect(clearFiltersHref(state)).toBe("/search?q=A+%26+B");
  });
  it("does not reinfer a removed chip from the original phrase", () => {
    const state = resolveSearchState("plumbers in Sacramento", {}, parseTradeLocation("plumbers in Sacramento", classifications));
    expect(removeFilterHref(state, "city")).toBe("/search?classification=c36");
    expect(clearFiltersHref(state)).toBe("/search");
  });
  it("infers a new phrase submitted with blank GET form controls", () => {
    const input = readFilterParams({ classification: "", city: "", zip: "", status: "", sort: "relevance" });
    const state = resolveSearchState("plumbers in Sacramento", input, parseTradeLocation("plumbers in Sacramento", classifications));
    expect(state.filters).toMatchObject({ classification: "c36", city: "sacramento" });
    expect(readFilterParams({ city: ["a", "b"], status: "ACTIVE" })).toEqual({ status: "ACTIVE" });
  });
});

describe("offline filter parity", () => {
  it("filters across all matches, not a page subset", () => {
    const found = searchDemoContractors(demoContractors, "", { status: "ACTIVE", classification: "c36", city: "Sacramento" });
    expect(found.results).toHaveLength(2);
    expect(found.results.every((r) => r.contractor.licenseStatus === "ACTIVE")).toBe(true);
  });
  it("does not hide expired licenses by default", () => {
    const found = searchDemoContractors(demoContractors, "992614");
    expect(found.results[0].contractor.licenseStatus).toBe("EXPIRED");
    expect(searchDemoContractors(demoContractors, "992614", { status: "ACTIVE" }).results).toEqual([]);
  });
  it("alphabetizes the entire set for name sorting", () => {
    const found = searchDemoContractors(demoContractors, "", { classification: "c36", sort: "name" });
    const names = found.results.map((r) => r.contractor.businessNameNormalized);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
