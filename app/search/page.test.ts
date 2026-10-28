import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage, { metadata } from "./page";
import { searchContractors } from "@/lib/search/search-contractors";
import { SearchInputError } from "@/lib/search/filters";

vi.mock("@/lib/search/search-contractors", () => ({ searchContractors: vi.fn() }));
vi.mock("@/lib/contractors/repository", () => ({ getSearchClassifications: async () => [] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => { vi.mocked(searchContractors).mockRejectedValue(new SearchInputError("Location search is temporarily unavailable.")); });

describe("geographic search recovery", () => {
  it("keeps a removable location chip after an outage without broadening results", async () => {
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "builder", lat: "38.58", lng: "-121.49", radius: "25", sort: "distance" }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Remove Within 25 miles of 38.58, -121.49"');
    expect(html).toContain('href="/search?q=builder"');
    expect(html).not.toContain('class="results-list"');
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
  it("preserves invalid location values for correction", async () => {
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ lat: "999", lng: "-121" }) }));
    expect(html).toContain('value="999"');
    expect(html).toContain("Enter a valid center latitude");
  });
});
