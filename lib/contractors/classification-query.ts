import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassificationFilters = { q?: string; city?: string; zip?: string; status?: string };

function literalPattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Only fetch the IDs that the landing page displays. The old RPC's DISTINCT
 * and count(*) OVER () process the statewide match set before applying LIMIT,
 * even though these pages never use that total. Keep filters before the limit
 * and hydrate full records separately so all classifications remain visible.
 */
export async function getClassificationLicenseIds(
  client: SupabaseClient,
  slug: string,
  filters: ClassificationFilters,
): Promise<number[]> {
  let query = client.from("licenses")
    .select("id, license_classifications!inner(classifications!inner(slug))")
    .eq("license_classifications.classifications.slug", slug)
    .limit(100);

  if (filters.q?.trim()) {
    // Use the same database normalizer as the previous classification RPC:
    // business-name substring matching, not universal/fuzzy search.
    const { data, error } = await client.rpc("normalize_business_name", { input: filters.q });
    if (error || typeof data !== "string") throw new Error("Supabase business normalization failed: " + (error?.message ?? "Invalid response"));
    query = query.like("business_name_normalized", "%" + literalPattern(data) + "%");
  }
  if (filters.city?.trim()) {
    const city = filters.city.trim();
    // The existing GIN index narrows candidates, including empty match sets.
    // Keep the exact city predicate authoritative: words in business names or
    // other search-vector fields must not broaden the geographic filter.
    query = query.textSearch("search_vector", city, { type: "plain", config: "simple" })
      .ilike("city", literalPattern(city));
  }
  if (filters.zip?.trim()) {
    const zip = filters.zip.trim();
    if (/^\d{1,5}$/.test(zip)) {
      query = query.textSearch("search_vector", zip + ":*", { config: "simple" });
    }
    query = query.like("zip", literalPattern(zip) + "%");
  }
  if (filters.status?.trim()) query = query.eq("license_status", filters.status.trim().toUpperCase());

  const { data, error } = await query;
  if (error) throw new Error("Supabase classification query failed: " + error.message);
  // These non-paginated landing pages display a bounded selection, not a
  // globally ranked result set. Sort only the returned IDs: ordering the whole
  // match set makes Postgres favor a slow primary-key scan for large cities.
  return (data ?? []).map((row) => Number(row.id)).sort((a, b) => a - b);
}
