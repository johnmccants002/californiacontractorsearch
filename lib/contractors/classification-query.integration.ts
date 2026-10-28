import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { featuredClassifications } from "@/config/site";
import { getClassificationLicenseIds } from "./classification-query";

vi.mock("server-only", () => ({}));
let client: SupabaseClient;
beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Classification integration tests require public Supabase credentials.");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
});

async function records(ids: number[]) {
  const { data, error } = await client.from("licenses")
    .select("id,license_number,business_name_normalized,city,zip,license_status,license_classifications(classifications(slug))")
    .in("id", ids);
  if (error) throw error;
  return data!;
}

describe("homepage trade queries against imported records (read-only public access)", () => {
  it.each(featuredClassifications)("loads $code without the old statewide-count RPC", async ({ slug }) => {
    const ids = await getClassificationLicenseIds(client, slug, {});
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const rows = await records(ids);
    expect(rows).toHaveLength(ids.length);
    for (const row of rows) expect(JSON.stringify(row.license_classifications)).toContain('"slug":"' + slug + '"');
  });
  it("keeps business-name substring matching and the original 1 Demolition record", async () => {
    const ids = await getClassificationLicenseIds(client, "c21", { q: "1 Demolition Inc." });
    const rows = await records(ids);
    expect(rows.some((row) => row.license_number === "1082303")).toBe(true);
    for (const row of rows) expect(row.business_name_normalized).toContain("1 demolition");
  });
  it("applies city, ZIP prefix, and status before limiting the matching selection", async () => {
    const ids = await getClassificationLicenseIds(client, "c36", { city: " Sacramento ", zip: "95814", status: "active" });
    expect(ids.length).toBeGreaterThan(0);
    for (const row of await records(ids)) {
      expect(row.city.toLowerCase()).toBe("sacramento");
      expect(row.zip).toMatch(/^95814/);
      expect(row.license_status).toBe("ACTIVE");
      expect(JSON.stringify(row.license_classifications)).toContain('"slug":"c36"');
    }
  });
  it("does not broaden an unmatched city", async () => {
    expect(await getClassificationLicenseIds(client, "b", { city: "Zzz Nonexistent City" })).toEqual([]);
  });
  it("loads city-only filters without scanning the statewide match set", async () => {
    const ids = await getClassificationLicenseIds(client, "b", { city: "Los Angeles" });
    expect(ids.length).toBeGreaterThan(0);
    for (const row of await records(ids)) expect(row.city.toLowerCase()).toBe("los angeles");
  });
  it("loads ZIP-only prefix filters using the existing search index", async () => {
    const ids = await getClassificationLicenseIds(client, "b", { zip: "958" });
    expect(ids.length).toBeGreaterThan(0);
    for (const row of await records(ids)) expect(row.zip).toMatch(/^958/);
  });
});
