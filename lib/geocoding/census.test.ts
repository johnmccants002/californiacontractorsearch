import { describe, expect, it, vi } from "vitest";
import { acceptedLocation, emptyGeocode, prepareAddress } from "./address";
import { censusCsv, censusRequest, geocodeBatch, geocodeSingle, parseCensusCsv } from "./census";
vi.mock("server-only", () => ({}));
const address = { address_line_1: "123 Main St.", address_line_2: null, city: "Sacramento", state: "CA", zip: "95814" };
const item = { id: "stable-id", address: prepareAddress(address).address };
const exact = '"stable-id","123 Main St, Sacramento, CA, 95814",Match,Exact,"123 MAIN ST, SACRAMENTO, CA, 95814","-121.49,38.58",123,L';

describe("address identity and acceptance", () => {
  it("deduplicates harmless formatting while retaining units and changed addresses", () => {
    expect(prepareAddress({ ...address, address_line_1: "  123 MAIN ST " }).hash).toBe(prepareAddress(address).hash);
    expect(prepareAddress({ ...address, address_line_2: "APT 2" }).hash).not.toBe(prepareAddress(address).hash);
    expect(prepareAddress({ ...address, address_line_1: "124 Main St" }).hash).not.toBe(prepareAddress(address).hash);
  });
  it.each(["PO BOX 25", "P.O. Box 25", "123 Main St PMB 25", "GENERAL DELIVERY"])("skips mailbox address %s", (street) => {
    expect(prepareAddress({ ...address, address_line_1: street }).skip).toBe("skipped_po_box");
  });
  it("does not manufacture street or regional information", () => {
    expect(prepareAddress({ ...address, address_line_1: null }).skip).toBe("skipped_missing_address");
    expect(prepareAddress({ ...address, address_line_1: "Main Street" }).skip).toBe("skipped_non_street");
    expect(prepareAddress({ ...address, state: "ON" }).skip).toBe("skipped_unsupported_region");
  });
  it("only exposes coordinates matching the current original address", () => {
    const row = { ...address, latitude: 38.58, longitude: -121.49, geocode_status: "accepted", geocode_source: "us_census", geocode_benchmark: "Public_AR_Current", geocode_quality: "exact", geocode_matched_address: "123 MAIN ST", geocode_address_hash: prepareAddress(address).hash, geocoded_at: "2026-10-27T00:00:00Z" };
    expect(acceptedLocation(row)).toEqual([38.58, -121.49]);
    expect(acceptedLocation({ ...row, city: "Fresno" })).toBeUndefined();
    expect(acceptedLocation({ ...row, geocode_status: "review" })).toBeUndefined();
    expect(acceptedLocation({ ...row, latitude: NaN })).toBeUndefined();
  });
});

describe("Census CSV protocol", () => {
  it("quotes CSV and limits uploads to 10,000 unique IDs", () => {
    expect(censusCsv([{ ...item, address: { ...item.address, street: '123 "MAIN", ST' } }])).toContain('"123 ""MAIN"", ST"');
    expect(() => censusCsv(Array.from({ length: 10001 }, (_, i) => ({ ...item, id: String(i) })))).toThrow();
    expect(() => censusCsv([item, item])).toThrow();
  });
  it("maps longitude,latitude into correctly labeled values and preserves IDs", () => {
    expect(parseCensusCsv(`\uFEFF${exact}\r\n`, [item]).get(item.id)).toMatchObject({ status: "accepted", quality: "exact", latitude: 38.58, longitude: -121.49 });
  });
  it.each([["No_Match", "unmatched"], ["Tie", "ambiguous"]])("parses short %s rows", (indicator, status) => {
    expect(parseCensusCsv(`stable-id,input,${indicator}`, [item]).get(item.id)).toMatchObject({ status, latitude: null, longitude: null });
  });
  it("keeps non-exact matches for review without searchable coordinates", () => {
    expect(parseCensusCsv(exact.replace(",Exact,", ",Non_Exact,"), [item]).get(item.id)).toMatchObject({ status: "review", latitude: null, longitude: null });
  });
  it.each(["", "stable-id,input,Unknown", exact.replace("stable-id", "unknown"), `${exact}\n${exact}`, "<html>Unavailable</html>"])("rejects incomplete or invalid responses", (csv) => {
    expect(() => parseCensusCsv(csv, [item])).toThrow();
  });
  it.each(["38.58,-121.49", ",", "NaN,38.5", "0,0"])("rejects invalid/swapped coordinates %s", (coordinates) => {
    expect(parseCensusCsv(exact.replace("-121.49,38.58", coordinates), [item]).get(item.id)?.status).toBe("invalid_response");
  });
});

describe("server-only Census transport", () => {
  it("retries network and temporary failures with bounded backoff", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("private address URL"))
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "99999" } }))
      .mockResolvedValueOnce(new Response(exact));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await geocodeBatch([item], { fetcher, sleep });
    expect(result.results.get(item.id)?.status).toBe("accepted");
    expect(sleep.mock.calls).toEqual([[1000], [30000]]);
    const form = fetcher.mock.calls[0][1]!.body as FormData;
    expect(form.get("benchmark")).toBe("Public_AR_Current");
    expect(form.get("addressFile")).toBeInstanceOf(Blob);
  });
  it("does not retry permanent HTTP errors or leak error details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private response", { status: 400 }));
    await expect(censusRequest("locations/address", {}, new URLSearchParams(), { fetcher })).rejects.toThrow("Census request failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("supports single-address lookup but does not pretend a JSON candidate is an Exact batch match", async () => {
    const match = { matchedAddress: "123 MAIN ST", coordinates: { x: -121.49, y: 38.58 } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [match] } })));
    expect(await geocodeSingle(address, { fetcher })).toMatchObject({ status: "review", quality: "single_candidate", latitude: null });
    expect(String(fetcher.mock.calls[0][0])).toContain("benchmark=Public_AR_Current");
  });
  it("skips PO boxes before contacting Census", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await geocodeSingle({ ...address, address_line_1: "PO BOX 5" }, { fetcher })).toMatchObject(emptyGeocode("skipped_po_box", "skipped_po_box", expect.any(String)));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not choose among ambiguous single-address candidates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [{}, {}] } })));
    expect(await geocodeSingle(address, { fetcher })).toMatchObject({ status: "ambiguous", latitude: null, longitude: null });
  });
});
