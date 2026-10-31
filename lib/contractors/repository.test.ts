import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAllContractors, getContractorByLicense, getContractorsByIds, getContractorsForClassificationFromDatabase, getDatasetSource } from "./repository";
import { recordSource, sourceDate } from "./provenance";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

function database(data: unknown, status = 200) {
  return createClient("https://records.test", "test-public-key", { auth: { persistSession: false }, global: {
    fetch: async () => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  } });
}

beforeEach(() => vi.clearAllMocks());

describe("record provenance", () => {
  it("distinguishes actual import markers, demo seeds, and unknown records", () => {
    expect(recordSource({ license_number: "1056730", business_name: "ABC Plumbing Inc." })).toBe("demo");
    expect(recordSource({ license_number: "1056730", business_name: "Actual business", source_status: "CLEAR" })).toBe("cslb");
    expect(recordSource({ license_number: "1", business_name: "Unknown" })).toBe("unknown");
  });
  it("never invents a source timestamp", () => {
    expect(sourceDate(null)).toBeUndefined();
    expect(sourceDate("invalid")).toBeUndefined();
    expect(sourceDate("2025-12-11T00:00:00+00:00")).toBe("2025-12-11T00:00:00.000Z");
  });
});

describe("source-aware repository", () => {
  it("hydrates missing-source warnings for both profile and search without changing status", async () => {
    const row={id:1,license_number:'1082303',business_name:'1 DEMOLITION',source_status:'CLEAR',license_status:'ACTIVE',source_missing_since:'2026-10-28',source_updated_at:'2026-10-03'};
    vi.mocked(createServerSupabaseClient).mockReturnValue(database(row));
    const profile=await getContractorByLicense('1082303');
    expect(profile).toMatchObject({id:1,licenseStatus:'ACTIVE',sourceMissingSince:'2026-10-28',sourceUpdatedAt:'2026-10-03'});
    vi.mocked(createServerSupabaseClient).mockReturnValue(database([row]));
    expect(await getContractorsByIds([1])).toEqual([profile]);
    vi.mocked(createServerSupabaseClient).mockReturnValue(database({...row,source_missing_since:null}));
    expect((await getContractorByLicense('1082303'))?.sourceMissingSince).toBeUndefined();
  });
  it("hydrates bounded trade IDs in order without dropping other classifications", async () => {
    const requests: URL[] = [];
    const client = createClient("https://records.test", "test-public-key", { auth: { persistSession: false }, global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        requests.push(url);
        const data = url.searchParams.has("id") ? [{
          id: 9, license_number: "9999999", business_name: "TEST CONTRACTOR", source_status: "CLEAR",
          license_classifications: [{ classifications: { id: 1, code: "c21", slug: "c21", name: "Demolition" } }],
        }, {
          id: 1, license_number: "1082303", business_name: "1 DEMOLITION", source_status: "CLEAR",
          license_classifications: [
            { classifications: { id: 1, code: "c21", slug: "c21", name: "Demolition" } },
            { classifications: { id: 2, code: "d06", slug: "d06", name: "Concrete Related Services" } },
          ],
        }] : [{ id: 9 }, { id: 1 }];
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      },
    } });
    vi.mocked(createServerSupabaseClient).mockReturnValue(client);
    const contractors = await getContractorsForClassificationFromDatabase("c21", {});
    expect(contractors?.map((contractor) => contractor.id)).toEqual([1, 9]);
    expect(contractors?.[0].classifications.map((item) => item.code)).toEqual(["c21", "d06"]);
    expect(requests).toHaveLength(2);
    expect(requests[0].searchParams.get("limit")).toBe("100");
    expect(requests[1].searchParams.get("id")).toBe("in.(1,9)");
  });
  it("uses labeled demo data only without a configured database", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(null);
    expect(await getDatasetSource()).toBe("demo");
    expect((await getContractorByLicense("1056730"))?.dataSource).toBe("demo");
  });
  it("maps live records to their actual source", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(database({ id: 1, license_number: "1082303", business_name: "1 DEMOLITION", source_status: "CLEAR" }));
    expect((await getContractorByLicense("1082303"))?.dataSource).toBe("cslb");
  });
  it("does not substitute a demo when a real record is absent", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(database(null));
    expect(await getContractorByLicense("1056730")).toBeUndefined();
  });
  it("fails visibly rather than substituting demo data on database errors", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(database({ message: "Database unavailable" }, 400));
    await expect(getContractorByLicense("1056730")).rejects.toThrow("license query failed");
    await expect(getAllContractors()).rejects.toThrow("contractor query failed");
    expect(await getDatasetSource()).toBe("unavailable");
  });
  it.each([
    [[], "empty"],
    [[{ license_number: "1082303", business_name: "1 DEMOLITION", source_status: "CLEAR" }], "cslb"],
    [[{ license_number: "1056730", business_name: "ABC Plumbing Inc." }], "demo"],
    [[{ license_number: "1", business_name: "Unconfirmed" }], "unknown"],
  ])("describes the actual connected dataset", async (data, source) => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(database(data));
    expect(await getDatasetSource()).toBe(source);
  });
});
