import { describe, expect, it, vi } from "vitest";
import { classifications } from "@/lib/contractors/demo-data";
import { searchIndex, type IndexSearch } from "./query";

const runner = () => vi.fn<IndexSearch>().mockResolvedValue({ found: 0, hits: [] });
describe("Typesense query interpretation and constraints", () => {
  it.each(["#1082303", "License #1082303", "License number 1082303"])("uses exact digits, never fuzzy matching, for %s", async (query) => {
    const search = runner();
    await searchIndex(search, query, 1, 10, {}, classifications);
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: "*", filter_by: "record_kind:=contractor && license_number:=1082303", page: 1, per_page: 10 }));
  });
  it.each(["C-36", "C36", "plumber", "plumbing"])("normalizes %s as a strict classification", async (query) => {
    const search = runner();
    const data = await searchIndex(search, query, 1, 10, {}, classifications);
    expect(data.state.filters.classification).toBe("c36");
    expect(search.mock.lastCall![0]).toMatchObject({ q: "*", filter_by: "record_kind:=contractor && classification_codes:=`c36`" });
  });
  it("preserves an exact business name that resembles a trade/location", async () => {
    const search = runner().mockResolvedValueOnce({ found: 1 });
    const data = await searchIndex(search, "Plumbing in Sacramento", 1, 10, {}, classifications);
    expect(data.state.query).toBe("Plumbing in Sacramento");
    expect(data.state.filters.classification).toBe("");
  });
  it("turns explicit trade/location phrases into hard filters without broadening empty results", async () => {
    const search = runner();
    const data = await searchIndex(search, "plumbers in Sacramento", 1, 10, { status: "ACTIVE", county: "Sacramento" }, classifications);
    expect(data.total).toBe(0);
    expect(search.mock.lastCall![0]).toMatchObject({ q: "*", filter_by: "record_kind:=contractor && classification_codes:=`c36` && city:=`sacramento` && county:=`sacramento` && license_status:=ACTIVE" });
  });
  it("applies explicit overrides and exact ZIP filters", async () => {
    const search = runner();
    await searchIndex(search, "plumbers in Sacramento", 2, 10, { city: "Fresno", zip: "93701", sort: "name" }, classifications);
    expect(search.mock.lastCall![0]).toMatchObject({ page: 2, per_page: 10, sort_by: "business_name_normalized:asc,license_id:asc" });
    expect(search.mock.lastCall![0].filter_by).toContain("city:=`fresno` && zip:=93701");
    await searchIndex(search, "95814", 1, 10, {}, classifications);
    expect(search.mock.lastCall![0].filter_by).toBe("record_kind:=contractor && zip:=95814");
  });
  it("retains name prefixes, personnel matches and controlled name typo tolerance", async () => {
    const search = runner();
    await searchIndex(search, "1 Demoltion", 1, 10, {}, classifications);
    expect(search.mock.lastCall![0]).toMatchObject({ q: "1 demoltion", query_by_weights: "10,7,4,2,1,1", num_typos: "2,1,0,0,0,0", drop_tokens_threshold: 0 });
    expect(search.mock.lastCall![0].query_by).toContain("personnel_names");
  });
  it("never inserts raw filter operators and rejects invalid input", async () => {
    const search = runner();
    await searchIndex(search, "", 1, 10, { city: "LA` || license_status:ACTIVE" }, classifications);
    expect(search.mock.lastCall![0].filter_by).toBe("record_kind:=contractor && city:=`la license status active`");
    await expect(searchIndex(search, "", 1, 10, { status: "anything" }, classifications)).rejects.toThrow("valid license status");
  });
  it("does not browse the entire index for an empty search", async () => {
    const search = runner();
    expect((await searchIndex(search, "", 1, 10, {}, classifications)).total).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });
  it("rejects cutoff/partial responses rather than reporting false totals", async () => {
    const search = runner().mockResolvedValue({ found: 20, search_cutoff: true });
    await expect(searchIndex(search, "1082303", 1, 10, {}, classifications)).rejects.toThrow("incomplete");
  });
});
