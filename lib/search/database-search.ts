import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBusinessName } from "./normalize";
import { parseQuery } from "./parse-query";
import { hasSearchFilters, resolveSearchState, validateClassification, type FilterInput, type SearchState } from "./filters";
import { parseTradeLocation, tradeLocationDescription, type SearchClassification } from "./trade-location";

export interface SearchIdRow {
  license_id: number;
  relevance_score: number;
  matched_by: string[];
}
interface SearchIds {
  rows: SearchIdRow[];
  total: number;
  state: SearchState;
  interpretation?: string;
}

/** Shared by production and public-permission integration tests. */
export async function searchLicenseIds(
  client: SupabaseClient,
  rawQuery: string,
  offset: number,
  limit: number,
  filters: FilterInput = {},
  suppliedCatalog?: SearchClassification[],
): Promise<SearchIds> {
  const parsed = parseQuery(rawQuery);
  let catalog = suppliedCatalog ?? [];
  if (!suppliedCatalog && (parsed.kind === "text" || filters.classification)) {
    const { data, error } = await client.from("classifications").select("id, code, name, aliases");
    if (error) throw new Error(`Supabase classification lookup failed: ${error.message}`);
    catalog = (data ?? []) as SearchClassification[];
  }
  const explicit = validateClassification(filters, catalog);
  let intent = parsed.kind === "text" ? parseTradeLocation(rawQuery, catalog) : null;
  if (intent) {
    const exactName = await client.from("licenses").select("id")
      .eq("business_name_normalized", normalizeBusinessName(rawQuery)).limit(1);
    if (exactName.error) throw new Error(`Supabase business lookup failed: ${exactName.error.message}`);
    if (exactName.data?.length) intent = null;
    else if (!intent.explicitLocation && intent.city) {
      const city = await client.from("licenses").select("id")
        .textSearch("search_vector", intent.city, { type: "plain", config: "simple" })
        .ilike("city", intent.city).limit(1);
      if (city.error) throw new Error(`Supabase city lookup failed: ${city.error.message}`);
      if (!city.data?.length) intent = null;
    }
  }

  const state = resolveSearchState(rawQuery, explicit, intent);
  if (!state.query && !hasSearchFilters(state.filters)) return { rows: [], total: 0, state };
  const { data, error } = await client.rpc("search_license_ids_v3", {
    search_query: state.query,
    classification_filter: state.filters.classification,
    city_filter: state.filters.city,
    zip_filter: state.filters.zip,
    status_filter: state.filters.status,
    sort_order: state.filters.sort,
    result_offset: offset,
    result_limit: limit,
  });
  if (error) throw new Error(`Supabase contractor search failed: ${error.message}`);
  const result = data as { rows: SearchIdRow[]; total: number };
  return {
    rows: result.rows,
    total: Number(result.total),
    state,
    interpretation: intent && state.filters.classification === intent.classification.code &&
      state.filters.city === (intent.city ?? "") && state.filters.zip === (intent.zip ?? "")
      ? tradeLocationDescription(intent) : undefined,
  };
}
