import "server-only";
import { createTypesenseSearchClient } from "./client";
import { searchIndex, type IndexSearch } from "./query";
import { SCHEMA_VERSION, GEO_SCHEMA_VERSION, type ContractorDocument, type IndexMarker } from "./schema";
import { getSearchClassifications, getContractorsByIds } from "@/lib/contractors/repository";
import type { FilterInput } from "@/lib/search/filters";
import type { SearchClassification } from "@/lib/search/trade-location";
import type { PaginatedResults } from "@/lib/contractors/types";
import { normalizeText } from "@/lib/search/normalize";
import { distanceMiles, geoEnabled, hasGeoInput } from "@/lib/search/geo";
import { SearchInputError } from "@/lib/search/filters";

export async function searchTypesenseContractors(query: string, page: number, pageSize: number, filters: FilterInput, catalog?: SearchClassification[]): Promise<PaginatedResults> {
  const geographic = hasGeoInput(filters);
  if (geographic && !geoEnabled()) throw new SearchInputError("Location search is not enabled yet. Remove the location filter to continue.");
  const { client, collection } = createTypesenseSearchClient();
  // One total deadline across readiness, interpretation probes, and results.
  const signal = AbortSignal.timeout(2500);
  const marker = await client.collections<IndexMarker>(collection).documents().search({ q: "*", query_by: "business_name", filter_by: "record_kind:=manifest", per_page: 1 }, { abortSignal: signal });
  const manifest = marker.hits?.[0]?.document;
  if (manifest?.ready !== true || ![SCHEMA_VERSION, GEO_SCHEMA_VERSION].includes(manifest.schema_version) || (geographic && manifest.schema_version !== GEO_SCHEMA_VERSION)) throw new Error("Typesense index is not ready.");
  const search: IndexSearch = (params) => client.collections<ContractorDocument>(collection).documents().search(params, { abortSignal: signal });
  const data = await searchIndex(search, query, page, pageSize, filters, catalog ?? await getSearchClassifications());
  const ids = data.results.map((hit) => hit.document.license_id);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("Invalid search IDs.");
  const contractors = await getContractorsByIds(ids);
  if (contractors.length !== ids.length || contractors.some((c) => c.dataSource !== "cslb")) throw new Error("Search index is out of sync.");
  const f = data.state.filters;
  if (contractors.some((c, i) => c.businessName !== data.results[i].document.business_name ||
      (f.city && normalizeText(c.city) !== f.city) || (f.county && normalizeText(c.county ?? "") !== f.county) ||
      (f.zip && !c.zip.replace(/\D/g, "").startsWith(f.zip)) || (f.status && c.licenseStatus !== f.status) ||
      (f.classification && !c.classifications.some((classification) => classification.code === f.classification)))) {
    throw new Error("Search index filters are out of sync.");
  }
  if (f.geo && contractors.some((c, i) => {
    const indexed = data.results[i].document.location;
    return !c.registeredLocation || !indexed || indexed.some((coordinate, n) => coordinate !== c.registeredLocation![n]) ||
      (f.geo!.radiusMiles !== undefined && distanceMiles(f.geo!, c.registeredLocation) > f.geo!.radiusMiles + 0.005);
  })) throw new Error("Search index locations are out of sync.");
  return {
    source: "supabase", engine: "typesense", page, pageSize, total: data.total, totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
    state: data.state, interpretation: data.interpretation,
    results: contractors.map((contractor, i) => ({ contractor, score: data.results[i].text_match ?? 0,
      matchedBy: data.state.filters.classification ? [`${data.state.filters.classification.toUpperCase()} classification`] : ["search relevance"],
      highlightTokens: data.results[i].highlight?.business_name?.matched_tokens?.filter((token) => typeof token === "string").slice(0, 20),
      ...(f.geo && contractor.registeredLocation ? { distanceMiles: distanceMiles(f.geo, contractor.registeredLocation) } : {}),
    })),
  };
}
