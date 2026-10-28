import { describe, expect, it } from "vitest";
import { contractorSchema, mapIndexDocument, type IndexRow } from "./schema";
const row: IndexRow = { id: 77, license_number: "1082303", business_name: "1 DEMOLITION INC", license_status: "ACTIVE", city: "EL CERRITO", county: "Contra Costa", state: "CA", zip: "94530-1234", issue_date: "2021-08-01", updated_at: "2026-01-01", source_updated_at: "2026-01-01", source_status: "Clear", personnel: [{ full_name: "Jane Doe" }], license_classifications: [{ classifications: { code: "C-36", name: "Plumbing", aliases: ["plumber"] } }] };
describe("public CSLB index projection", () => {
  it("retains source identity, related names, normalized facets and dates", () => {
    expect(mapIndexDocument(row)).toMatchObject({ id: "77", license_id: 77, license_number: "1082303", business_name_normalized: "1 demolition", personnel_names: ["Jane Doe"], classification_codes: ["c36"], county: "contra costa", city: "el cerrito", zip: "94530", issue_date: Date.parse("2021-08-01") / 1000 });
  });
  it("does not copy private/unnecessary profile fields or invent coordinates", () => {
    const result = mapIndexDocument({ ...row, phone: "secret", policy_number: "secret" } as IndexRow);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).not.toHaveProperty("location");
    expect(contractorSchema("contractors_v1").fields?.find((f) => f.name === "county")?.facet).toBe(true);
  });
  it("excludes unconfirmed records and rejects unsafe IDs", () => {
    expect(mapIndexDocument({ ...row, source_status: null })).toBeNull();
    expect(() => mapIndexDocument({ ...row, id: Number.MAX_SAFE_INTEGER + 1 })).toThrow("identity");
  });
});
