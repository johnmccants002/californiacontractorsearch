import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { tradeCityPages } from "./directory-pages";
import { getTradeCityDirectory } from "./trade-city-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => client }));
let client: SupabaseClient;
beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Directory integration tests require public Supabase credentials.");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
});

describe("curated pages backed by public CSLB records (read-only)", () => {
  it.each(tradeCityPages)("populates $trade in $cityName using the production data helper", async (page) => {
    const data = await getTradeCityDirectory(page.trade, page.city);
    expect(data).not.toBeNull();
    expect(data!.contractors.length).toBeGreaterThan(0);
    expect(data!.contractors.length).toBeLessThanOrEqual(20);
    expect(new Set(data!.contractors.map((c) => c.id)).size).toBe(data!.contractors.length);
    for (const contractor of data!.contractors) {
      expect(contractor.dataSource).toBe("cslb");
      expect(contractor.state).toBe("CA");
      expect(contractor.city.toLowerCase()).toBe(page.cityName.toLowerCase());
      expect(contractor.classifications.some((c) => c.code === page.classification)).toBe(true);
    }
  });
});
