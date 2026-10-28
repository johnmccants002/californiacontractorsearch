import { describe, expect, it } from "vitest";
import { findClassification } from "@/lib/contractors/demo-data";
import { findTradeCityPage, hasDirectoryQuery, tradeCityPages, tradeCityPath, tradeCitySearchHref } from "./directory-pages";

describe("curated directory allowlist", () => {
  it("has five distinct, supported trade/city pairs", () => {
    expect(tradeCityPages).toHaveLength(5);
    expect(new Set(tradeCityPages.map(tradeCityPath)).size).toBe(5);
    for (const page of tradeCityPages) {
      expect(findClassification(page.classification)).toBeDefined();
      expect(findTradeCityPage(page.trade, page.city)).toEqual(page);
      const url = new URL(tradeCitySearchHref(page), "https://example.test");
      expect(url.pathname).toBe("/search");
      expect(url.searchParams.get("classification")).toBe(page.classification);
      expect(url.searchParams.get("city")).toBe(page.cityName.toLowerCase());
      expect(url.searchParams.get("sort")).toBe("name");
    }
  });
  it.each([["plumbing", "los-angeles"], ["Plumbing", "sacramento"], ["unknown", "sacramento"], ["plumbing", "../sacramento"]])("does not manufacture pages for %s/%s", (trade, city) => {
    expect(findTradeCityPage(trade, city)).toBeUndefined();
  });
  it("marks any parameterized directory URL as non-indexable", () => {
    expect(hasDirectoryQuery({})).toBe(false);
    for (const params of [{ city: "Sacramento" }, { q: "" }, { status: ["ACTIVE", "EXPIRED"] }, { page: "2" }, { utm_source: "email" }]) {
      expect(hasDirectoryQuery(params)).toBe(true);
    }
  });
});
