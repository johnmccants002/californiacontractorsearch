import type { SearchParams } from "typesense/lib/Typesense/Types";
import { normalizeBusinessName, normalizeText } from "@/lib/search/normalize";
import { parseQuery } from "@/lib/search/parse-query";
import { hasSearchFilters, resolveSearchState, validateClassification, SearchInputError, type FilterInput, type SearchState } from "@/lib/search/filters";
import { parseTradeLocation, tradeLocationDescription, type SearchClassification } from "@/lib/search/trade-location";
import type { ContractorDocument } from "./schema";

export type SearchParameters = SearchParams<ContractorDocument>;
export interface IndexHit { document: ContractorDocument; text_match?: number; highlight?: { business_name?: { matched_tokens?: string[] } } }
export interface IndexResponse { found: number; hits?: IndexHit[]; search_cutoff?: boolean; error?: string }
export type IndexSearch = (params: SearchParameters) => Promise<IndexResponse>;
const quoted = (text: string) => `\`${normalizeText(text)}\``;

export function indexFilters(state: SearchState) {
  const f = state.filters;
  return ["record_kind:=contractor", f.classification && `classification_codes:=${quoted(f.classification)}`,
    f.city && `city:=${quoted(f.city)}`, f.county && `county:=${quoted(f.county)}`,
    f.zip && `zip:=${f.zip}`, f.status && `license_status:=${f.status}`,
    f.geo && "has_location:=true", f.geo?.radiusMiles !== undefined && `location:(${f.geo.latitude}, ${f.geo.longitude}, ${f.geo.radiusMiles} mi)`].filter(Boolean).join(" && ");
}

export async function searchIndex(search: IndexSearch, query: string, page: number, pageSize: number, filters: FilterInput, catalog: SearchClassification[]) {
  if (query.length > 200 || (filters.city?.length ?? 0) > 80 || (filters.county?.length ?? 0) > 80) throw new SearchInputError("Please shorten your search.");
  const explicitLicense = query.trim().match(/^(?:license\s*(?:number|no\.?)?\s*#?|#)\s*([\d\s-]+)$/i)?.[1];
  const parsed = explicitLicense
    ? { ...parseQuery(query), kind: "license" as const, compact: explicitLicense.replace(/\D/g, "") }
    : parseQuery(query);
  const explicit = validateClassification(filters, catalog);
  const name = normalizeBusinessName(query);
  let exactName = false;
  if (parsed.kind === "text" && name) {
    const probe = await search({ q: "*", query_by: "business_name", filter_by: `record_kind:=contractor && business_name_normalized:=${quoted(name)}`, per_page: 0 });
    exactName = probe.found > 0;
  }
  let intent = !exactName && parsed.kind === "text" ? parseTradeLocation(query, catalog) : null;
  if (intent && !intent.explicitLocation && intent.city) {
    const probe = await search({ q: "*", query_by: "business_name", filter_by: `record_kind:=contractor && city:=${quoted(intent.city)}`, per_page: 0 });
    if (!probe.found) intent = null;
  }
  let state = resolveSearchState(query, explicit, intent);
  const trade = !exactName && !intent ? catalog.find((c) => [c.code, c.name, ...c.aliases].some((alias) => normalizeText(alias) === parsed.normalized)) : undefined;
  if (trade && !intent) state = resolveSearchState("", { classification: trade.code, ...explicit });
  if (parsed.kind === "zip") state = resolveSearchState("", { zip: parsed.compact, ...explicit });
  if (!state.query && !hasSearchFilters(state.filters)) return { results: [], total: 0, state };
  let filterBy = indexFilters(state);
  if (parsed.kind === "license") filterBy += ` && license_number:=${parsed.compact.replace(/\D/g, "")}`;
  const text = parsed.kind === "license" ? "*" : normalizeText(state.query) || "*";
  const geo = state.filters.geo;
  const sort = state.filters.sort === "distance" && geo
    ? `location(${geo.latitude}, ${geo.longitude}):asc,license_id:asc`
    : state.filters.sort === "name" || text === "*"
    ? "business_name_normalized:asc,license_id:asc"
    : `_eval(business_name_normalized:=${quoted(name)}):desc,_text_match:desc,license_id:asc`;
  const response = await search({
    q: text, query_by: "business_name,personnel_names,classification_terms,classification_descriptions,city,county",
    query_by_weights: "10,7,4,2,1,1", num_typos: "2,1,0,0,0,0", prefix: "true,true,false,false,false,false",
    prioritize_exact_match: true, text_match_type: "max_score", drop_tokens_threshold: 0,
    filter_by: filterBy, sort_by: sort, page, per_page: pageSize,
    highlight_fields: "business_name", highlight_full_fields: "business_name",
    include_fields: "id,license_id,license_number,business_name,city,county,state,zip,license_status,classification_codes,record_kind,location,has_location",
  });
  if (response.error || response.search_cutoff || !Number.isFinite(response.found)) throw new Error("Typesense returned an incomplete result.");
  return { results: response.hits ?? [], total: response.found, state,
    interpretation: intent ? tradeLocationDescription(intent) : trade ? `Filtering by ${trade.name}.` : undefined };
}
