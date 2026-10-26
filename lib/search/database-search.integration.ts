import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { searchLicenseIds } from "./database-search";

vi.mock("server-only", () => ({}));

let client: SupabaseClient;
beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Integration tests require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for an imported CSLB database.");
  // Deliberately do not use the service-role key: verify public permissions.
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
});

async function records(ids: number[]) {
  const { data, error } = await client.from("licenses")
    .select("id, license_number, business_name, business_name_normalized, license_status, city, zip, license_classifications(classifications(code))")
    .in("id", ids);
  if (error) throw error;
  return data!;
}

describe("production search against the imported CSLB database (read-only)", () => {
  it.each(["plumbers in Sacramento", "plumbers Sacramento", "plumber in Sacramento", "C-36 Sacramento"])(
    "%s returns actual C-36 licenses registered in Sacramento", async (query) => {
      const result = await searchLicenseIds(client, query, 0, 10);
      expect(result.total).toBeGreaterThan(10);
      expect(result.rows).toHaveLength(10);
      expect(result.interpretation).toContain("C-36");
      const rows = await records(result.rows.map((r) => r.license_id));
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.city.toLowerCase()).toBe("sacramento");
        expect(JSON.stringify(row.license_classifications)).toContain('"c36"');
      }
    },
  );

  it("equivalent trade phrases have the same membership and counts", async () => {
    const first = await searchLicenseIds(client, "plumbers in Sacramento", 0, 10);
    const second = await searchLicenseIds(client, "C-36 Sacramento", 0, 10);
    expect(second.rows).toEqual(first.rows);
    expect(second.total).toBe(first.total);
  });

  it.each(["demolition in El Cerrito", "demolition El Cerrito"])(
    "%s includes 1 Demolition without leaking other cities", async (query) => {
      const result = await searchLicenseIds(client, query, 0, 50);
      expect(result.total).toBeGreaterThan(0);
      const rows = await records(result.rows.map((r) => r.license_id));
      expect(rows.some((row) => row.license_number === "1082303")).toBe(true);
      for (const row of rows) {
        expect(row.city.toLowerCase()).toBe("el cerrito");
        expect(JSON.stringify(row.license_classifications)).toContain('"c21"');
      }
    },
  );

  it.each(["1 Demolition", "1082303"])("preserves the original %s lookup", async (query) => {
    const result = await searchLicenseIds(client, query, 0, 10);
    expect(result.interpretation).toBeUndefined();
    const first = await records([result.rows[0].license_id]);
    expect(first[0].license_number).toBe("1082303");
  });

  it("protects a real trade-prefixed business name from location interpretation", async () => {
    const { data, error } = await client.from("licenses").select("business_name_normalized")
      .like("business_name_normalized", "plumbing %").limit(1);
    if (error) throw error;
    expect(data).toHaveLength(1);
    const result = await searchLicenseIds(client, data![0].business_name_normalized, 0, 10);
    expect(result.interpretation).toBeUndefined();
    expect(result.rows[0].matched_by).toContain("exact business name");
    const first = await records([result.rows[0].license_id]);
    expect(first[0].business_name_normalized).toBe(data![0].business_name_normalized);
  });

  it.each(["plumbers in 95814", "plumbers in Sacramento CA 95814"])("filters %s by the actual ZIP", async (query) => {
    const result = await searchLicenseIds(client, query, 0, 10);
    expect(result.total).toBeGreaterThan(0);
    for (const row of await records(result.rows.map((r) => r.license_id))) {
      expect(row.zip).toMatch(/^95814/);
      expect(JSON.stringify(row.license_classifications)).toContain('"c36"');
    }
  });

  it("keeps an explicit unmatched location empty instead of returning fuzzy businesses", async () => {
    const result = await searchLicenseIds(client, "plumbers in Zzz Nonexistent City", 0, 10);
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.interpretation).toContain("zzz nonexistent city");
  });

  it("has deterministic, non-overlapping pages and preserves counts past the last page", async () => {
    const first = await searchLicenseIds(client, "plumbers in Sacramento", 0, 10);
    const second = await searchLicenseIds(client, "plumbers in Sacramento", 10, 10);
    expect(second.total).toBe(first.total);
    expect(second.rows).toHaveLength(10);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.license_id)).size).toBe(20);
    const repeated = await searchLicenseIds(client, "plumbers in Sacramento", 10, 10);
    expect(repeated.rows).toEqual(second.rows);
    const pastEnd = await searchLicenseIds(client, "plumbers in Sacramento", first.total + 10, 10);
    expect(pastEnd.rows).toEqual([]);
    expect(pastEnd.total).toBe(first.total);
  });

  it.each(["ACTIVE", "EXPIRED", "SUSPENDED", "INACTIVE"])("filter-only status %s returns only that status", async (status) => {
    const result = await searchLicenseIds(client, "", 0, 10, { status });
    const { count, error } = await client.from("licenses").select("id", { count: "exact", head: true }).eq("license_status", status);
    if (error) throw error;
    expect(result.total).toBe(count);
    expect(result.rows).toHaveLength(Math.min(count!, 10));
    if (result.rows.length) for (const row of await records(result.rows.map((r) => r.license_id))) expect(row.license_status).toBe(status);
  });

  it.each(["relevance", "name"])("supports statewide general-building browsing sorted by %s", async (sort) => {
    const result = await searchLicenseIds(client, "", 0, 10, { classification: "b", sort });
    expect(result.total).toBeGreaterThan(10);
    expect(result.rows).toHaveLength(10);
    for (const row of await records(result.rows.map((r) => r.license_id))) expect(JSON.stringify(row.license_classifications)).toContain('"b"');
  });

  it("supports a city-only filter without requiring search text", async () => {
    const result = await searchLicenseIds(client, "", 0, 10, { city: "El Cerrito" });
    expect(result.total).toBeGreaterThan(10);
    for (const row of await records(result.rows.map((r) => r.license_id))) expect(row.city.toLowerCase()).toBe("el cerrito");
  });

  it("applies explicit location overrides and status before counting", async () => {
    const result = await searchLicenseIds(client, "plumbers in Sacramento", 0, 50, { city: "Roseville", status: "ACTIVE" });
    const direct = await searchLicenseIds(client, "", 0, 50, { classification: "c36", city: "Roseville", status: "ACTIVE" });
    expect(result.rows).toEqual(direct.rows);
    expect(result.total).toBe(direct.total);
    expect(result.total).toBeGreaterThan(0);
    for (const row of await records(result.rows.map((r) => r.license_id))) {
      expect(row.city.toLowerCase()).toBe("roseville");
      expect(row.license_status).toBe("ACTIVE");
      expect(JSON.stringify(row.license_classifications)).toContain('"c36"');
    }
  });

  it("preserves relevance search while filtering license status", async () => {
    const active = await searchLicenseIds(client, "1 Demolition", 0, 10, { status: "ACTIVE" });
    expect(active.total).toBeGreaterThan(0);
    expect((await records([active.rows[0].license_id]))[0].license_number).toBe("1082303");
    const expired = await searchLicenseIds(client, "1082303", 0, 10, { status: "EXPIRED" });
    expect(expired.total).toBe(0);
    expect(expired.rows).toEqual([]);
  });

  it("sorts the full text match set by name across page boundaries", async () => {
    const first = await searchLicenseIds(client, "plumbing", 0, 10, { city: "Sacramento", sort: "name" });
    const next = await searchLicenseIds(client, "plumbing", 10, 10, { city: "Sacramento", sort: "name" });
    expect(first.rows).toHaveLength(10);
    expect(next.total).toBe(first.total);
    const ids = [...first.rows, ...next.rows].map((r) => r.license_id);
    expect(new Set(ids).size).toBe(20);
    const fetched = await records(ids);
    const byId = new Map(fetched.map((r) => [r.id, r.business_name_normalized]));
    const names = ids.map((id) => byId.get(id)!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("keeps the unfiltered default capable of finding a non-active license", async () => {
    const { data, error } = await client.from("licenses").select("id, license_number").eq("license_status", "SUSPENDED").limit(1);
    if (error) throw error;
    expect(data).toHaveLength(1);
    const found = await searchLicenseIds(client, data![0].license_number, 0, 10);
    expect(found.rows[0].license_id).toBe(data![0].id);
  });
});
