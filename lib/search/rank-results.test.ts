import { describe, expect, it } from "vitest";
import { demoContractors } from "@/lib/contractors/demo-data";
import { parseQuery } from "./parse-query";
import { rankResults, trigramSimilarity } from "./rank-results";

describe("search ranking", () => {
  it("ranks an exact license number first", () => {
    expect(rankResults(demoContractors, parseQuery("1056730"))[0]?.contractor.licenseNumber).toBe("1056730");
  });

  it("ranks an exact business name first", () => {
    expect(rankResults(demoContractors, parseQuery("ABC Plumbing"))[0]?.contractor.businessName).toBe("ABC Plumbing Inc.");
  });

  it("tolerates a business-name misspelling", () => {
    expect(rankResults(demoContractors, parseQuery("ABC Pluming"))[0]?.contractor.businessName).toBe("ABC Plumbing Inc.");
  });

  it("finds combined trade and city queries", () => {
    const results = rankResults(demoContractors, parseQuery("plumbers Sacramento"));
    expect(results[0]?.contractor.city).toBe("Sacramento");
    expect(results[0]?.contractor.classifications.some((item) => item.code === "c36")).toBe(true);
  });

  it("scores identical text above similar text", () => {
    expect(trigramSimilarity("abc plumbing", "abc plumbing")).toBeGreaterThan(trigramSimilarity("abc plumbing", "abc pluming"));
  });
});
