import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getLicenseSitemapEntries, getSitemapBounds, SITEMAP_ID_WINDOW } from "./sitemap-data";

vi.mock("server-only", () => ({}));
let client: SupabaseClient;
beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Read-only sitemap integration requires public Supabase credentials.");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
});

describe("live public sitemap access (read-only)", () => {
  it("exports the complete 1 Demolition window, beyond the API row cap", async () => {
    const { data: record, error } = await client.from("licenses").select("id, source_updated_at")
      .eq("license_number", "1082303").single();
    if (error) throw error;
    const shard = Math.floor(record.id / SITEMAP_ID_WINDOW);
    const bounds = await getSitemapBounds(client);
    expect(bounds!.first).toBeLessThanOrEqual(shard);
    expect(bounds!.last).toBeGreaterThanOrEqual(shard);
    const entries = await getLicenseSitemapEntries(client, shard);
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.length).toBeLessThanOrEqual(SITEMAP_ID_WINDOW);
    expect(new Set(entries.map((entry) => entry.licenseNumber)).size).toBe(entries.length);
    expect(entries.find((entry) => entry.licenseNumber === "1082303")?.lastModified).toBe(new Date(record.source_updated_at).toISOString());
    const { count, error: countError } = await client.from("licenses").select("id", { count: "exact", head: true })
      .gte("id", shard * SITEMAP_ID_WINDOW).lt("id", (shard + 1) * SITEMAP_ID_WINDOW)
      .not("source_status", "is", null).neq("source_status", "");
    if (countError) throw countError;
    expect(entries).toHaveLength(count!);
  });
});
