import { describe, expect, it } from "vitest";
import { classifications, demoContractors } from "@/lib/contractors/demo-data";
import { parseTradeLocation } from "./trade-location";
import { searchDemoContractors } from "./demo-search";

const catalog = [...classifications, {
  id: 8, code: "c21", name: "Building Moving/Demolition Contractor",
  aliases: ["demolition", "building moving", "demolition contractor"],
}];

describe("trade and location parsing", () => {
  it.each([
    ["plumbers in Sacramento", "c36", "sacramento", undefined, true],
    ["plumber Sacramento", "c36", "sacramento", undefined, false],
    ["Plumbing Contractor in Sacramento, CA", "c36", "sacramento", undefined, true],
    ["Plumbing Contractors Sacramento", "c36", "sacramento", undefined, false],
    [" C-36   Sacramento ", "c36", "sacramento", undefined, false],
    ["C 36 in Sacramento", "c36", "sacramento", undefined, true],
    ["demolition in El Cerrito", "c21", "el cerrito", undefined, true],
    ["demolition El Cerrito", "c21", "el cerrito", undefined, false],
    ["demolition contractor in El Cerrito", "c21", "el cerrito", undefined, true],
    ["electricians in San José", "c10", "san jose", undefined, true],
    ["roofers in 95814", "c39", undefined, "95814", true],
    ["C-36 95814", "c36", undefined, "95814", false],
    ["plumbers Sacramento CA 95814", "c36", "sacramento", "95814", false],
    ["plumbers in Sacramento 95814 California", "c36", "sacramento", "95814", true],
  ])("parses %s", (input, code, city, zip, explicitLocation) => {
    expect(parseTradeLocation(input!, catalog)).toMatchObject({
      classification: { code }, city, zip, explicitLocation,
    });
  });

  it.each(["", "1 Demolition", "ABC Plumbing", "John Smith", "1082303", "95814", "plumbers", "plumbers in", "C-36", "plumbers near Sacramento"])(
    "leaves %s to ordinary search", (input) => expect(parseTradeLocation(input, catalog)).toBeNull(),
  );
});

describe("demo search uses the same intent rules", () => {
  it("filters by actual classification and city, not incidental words", () => {
    const { results, interpretation } = searchDemoContractors(demoContractors, "plumbers in Sacramento");
    expect(results).toHaveLength(2);
    expect(results.every(({ contractor: c }) => c.city === "Sacramento" && c.classifications.some((v) => v.code === "c36"))).toBe(true);
    expect(interpretation).toContain("registered business location");
  });

  it("does not broaden a zero-result explicit city search", () => {
    expect(searchDemoContractors(demoContractors, "plumbers in No Such City").results).toEqual([]);
  });

  it("preserves an exact trade-prefixed business name", () => {
    const named = { ...demoContractors[0], businessName: "Plumbing Sacramento", businessNameNormalized: "plumbing sacramento" };
    const result = searchDemoContractors([named], "Plumbing Sacramento");
    expect(result.interpretation).toBeUndefined();
    expect(result.results[0].matchedBy).toContain("exact business name");
  });
});
