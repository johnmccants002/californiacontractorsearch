import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSource, sourceDate } from "@/lib/contractors/provenance";

// Stable primary-key windows avoid offset drift and cap each XML file well
// below Google's 50,000 URL / 50 MB limit. ID gaps are harmless.
export const SITEMAP_ID_WINDOW = 10_000;
const API_PAGE_SIZE = 1_000;
const MAX_INDEX_ENTRIES = 49_999; // Reserve one entry for pages.xml.

export interface SitemapBounds { first: number; last: number }
export interface LicenseSitemapEntry { licenseNumber: string; lastModified?: string }

function importedQuery<const Columns extends string>(client: SupabaseClient, columns: Columns) {
  // source_status is populated by the CSLB importer, never by the demo seed.
  return client.from("licenses").select(columns)
    .not("source_status", "is", null).neq("source_status", "");
}

export async function getSitemapBounds(client: SupabaseClient): Promise<SitemapBounds | null> {
  const [low, high] = await Promise.all([
    importedQuery(client, "id").order("id").limit(1),
    importedQuery(client, "id").order("id", { ascending: false }).limit(1),
  ]);
  if (low.error || high.error) throw new Error("Could not read sitemap bounds");
  if (!low.data?.length || !high.data?.length) return null;
  const minId = Number(low.data[0].id);
  const maxId = Number(high.data[0].id);
  if (!Number.isSafeInteger(minId) || !Number.isSafeInteger(maxId) || minId < 0 || maxId < minId) {
    throw new Error("Invalid sitemap bounds");
  }
  const first = Math.floor(minId / SITEMAP_ID_WINDOW);
  const last = Math.floor(maxId / SITEMAP_ID_WINDOW);
  if (last - first + 1 > MAX_INDEX_ENTRIES) throw new Error("Sitemap index requires further partitioning");
  return { first, last };
}

export async function getLicenseSitemapEntries(client: SupabaseClient, shard: number): Promise<LicenseSitemapEntry[]> {
  if (!Number.isSafeInteger(shard) || shard < 0 || !Number.isSafeInteger((shard + 1) * SITEMAP_ID_WINDOW)) {
    throw new Error("Invalid sitemap shard");
  }
  const end = (shard + 1) * SITEMAP_ID_WINDOW;
  let cursor = shard * SITEMAP_ID_WINDOW - 1;
  const entries: LicenseSitemapEntry[] = [];
  while (cursor < end - 1) {
    const { data, error } = await importedQuery(client, "id, license_number, business_name, source_status, source_updated_at")
      .gt("id", cursor).lt("id", end).order("id").limit(API_PAGE_SIZE);
    if (error || !data) throw new Error("Could not read license sitemap records");
    if (!data.length) break;
    for (const row of data) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor || id >= end) throw new Error("Invalid sitemap cursor");
      cursor = id;
      if (recordSource({ license_number: row.license_number, business_name: row.business_name, source_status: row.source_status }) !== "cslb") continue;
      const licenseNumber = String(row.license_number);
      if (!/^\d{1,10}$/.test(licenseNumber)) continue;
      entries.push({ licenseNumber, lastModified: sourceDate(row.source_updated_at as string | null) });
    }
    // Do not stop on a short page: the project's API row cap may be lower
    // than our requested page size. Stop only at the window end or no rows.
  }
  return entries;
}
