import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBusinessName, normalizeText } from "./normalize";
import { parseQuery } from "./parse-query";
import {
  parseTradeLocation,
  tradeLocationDescription,
  tradeLocationLabels,
  type SearchClassification,
  type TradeLocationQuery,
} from "./trade-location";

export interface SearchIdRow {
  license_id: number;
  relevance_score: number;
  matched_by: string[];
}

interface SearchIds {
  rows: SearchIdRow[];
  total: number;
  interpretation?: string;
}

async function searchTradeLocation(
  client: SupabaseClient,
  query: TradeLocationQuery,
  offset: number,
  limit: number,
): Promise<SearchIds> {
  // The GIN prefilter is important: the relational join alone can exceed the
  // public role's timeout on the statewide dataset. Exact filters below still
  // decide membership, not incidental mentions in business/personnel names.
  // A ZIP prefix token also matches ZIP+4 source values. All tsquery words
  // are normalized to alphanumerics before adding operators.
  const terms = normalizeText([query.classification.code, query.city].filter(Boolean).join(" ")).split(" ");
  if (query.zip) terms.push(`${query.zip}:*`);
  let request = client.from("licenses")
    .select("id, license_status, license_classifications!inner(classification_id)", { count: "exact" })
    .textSearch("search_vector", terms.join(" & "), { config: "simple" })
    .eq("license_classifications.classification_id", query.classification.id);

  if (query.city) request = request.ilike("city", query.city);
  if (query.zip) request = request.like("zip", `${query.zip}%`);

  let { data, count, error } = await request
    .order("license_status")
    .order("business_name_normalized")
    .order("id")
    .range(offset, offset + limit - 1);
  // PostgREST returns 416 beyond the last row, not an empty page. Recover the
  // exact count without loading the full result set or treating it as failure.
  if (error?.code === "PGRST103" && offset > 0) {
    const first = await request.range(0, 0);
    data = [];
    count = first.count;
    error = first.error;
  }
  if (error) throw new Error(`Supabase trade/location search failed: ${error.message}`);

  return {
    rows: (data ?? []).map((row) => ({
      license_id: Number(row.id),
      relevance_score: row.license_status === "ACTIVE" ? 1010 : 1000,
      matched_by: tradeLocationLabels(query),
    })),
    total: count ?? 0,
    interpretation: tradeLocationDescription(query),
  };
}

/** Shared by the production repository and the opt-in public-database tests. */
export async function searchLicenseIds(
  client: SupabaseClient,
  rawQuery: string,
  offset: number,
  limit: number,
): Promise<SearchIds> {
  const parsed = parseQuery(rawQuery);
  if (parsed.kind === "empty") return { rows: [], total: 0 };

  if (parsed.kind === "text") {
    const { data, error } = await client.from("classifications").select("id, code, name, aliases");
    if (error) throw new Error(`Supabase classification lookup failed: ${error.message}`);
    const intent = parseTradeLocation(rawQuery, (data ?? []) as SearchClassification[]);

    if (intent) {
      const exactName = await client.from("licenses").select("id")
        .eq("business_name_normalized", normalizeBusinessName(rawQuery)).limit(1);
      if (exactName.error) throw new Error(`Supabase business lookup failed: ${exactName.error.message}`);

      if (!exactName.data?.length) {
        // Explicit "in" and ZIP queries stay strict even when no one matches.
        // Implicit text like "Plumbing Solutions" is a business query unless
        // the remaining words really are a registered city.
        let knownLocation = intent.explicitLocation || !intent.city;
        if (!knownLocation && intent.city) {
          const city = await client.from("licenses").select("id")
            .textSearch("search_vector", intent.city, { type: "plain", config: "simple" })
            .ilike("city", intent.city).limit(1);
          if (city.error) throw new Error(`Supabase city lookup failed: ${city.error.message}`);
          knownLocation = Boolean(city.data?.length);
        }
        if (knownLocation) return searchTradeLocation(client, intent, offset, limit);
      }
    }
  }

  const { data, error } = await client.rpc("search_license_ids_v2", {
    search_query: rawQuery,
    result_offset: offset,
    result_limit: limit,
  });
  if (error) throw new Error(`Supabase contractor search failed: ${error.message}`);
  const rows = (data ?? []) as (SearchIdRow & { total_count: number })[];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}
