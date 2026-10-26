import type { Contractor } from "@/lib/contractors/types";
import { normalizeBusinessName, normalizeText } from "./normalize";
import { parseQuery } from "./parse-query";
import { rankResults } from "./rank-results";
import { parseTradeLocation, tradeLocationDescription } from "./trade-location";
import { hasSearchFilters, resolveSearchState, validateClassification, type FilterInput } from "./filters";

export function searchDemoContractors(contractors: Contractor[], rawQuery: string, filters: FilterInput = {}) {
  const catalog = [...new Map(contractors.flatMap((c) => c.classifications).map((c) => [c.code, c])).values()];
  const intent = parseTradeLocation(rawQuery, catalog);
  const exactBusiness = contractors.some((c) => c.businessNameNormalized === normalizeBusinessName(rawQuery));
  const knownLocation = intent && (intent.explicitLocation || !intent.city ||
    contractors.some((c) => normalizeText(c.city) === intent.city));

  const resolvedIntent = intent && knownLocation && !exactBusiness ? intent : null;
  const state = resolveSearchState(rawQuery, validateClassification(filters, catalog), resolvedIntent);
  const f = state.filters;
  const candidates = state.query ? rankResults(contractors, parseQuery(state.query)) :
    hasSearchFilters(f) ? contractors.map((contractor) => ({
      contractor, score: contractor.licenseStatus === "ACTIVE" ? 10 : 0,
      matchedBy: [] as string[],
    })) : [];
  const results = candidates.filter(({ contractor: c }) =>
    (!f.classification || c.classifications.some((classification) => classification.code === f.classification)) &&
    (!f.city || normalizeText(c.city) === f.city) && (!f.zip || c.zip.startsWith(f.zip)) &&
    (!f.status || c.licenseStatus === f.status))
    .map((result) => ({ ...result, matchedBy: [...result.matchedBy,
      ...(f.classification ? [`${f.classification.toUpperCase()} classification`] : []),
      ...(f.city ? [`city: ${f.city}`] : []), ...(f.zip ? [`ZIP: ${f.zip}`] : []),
      ...(f.status ? [`${f.status.toLowerCase()} license`] : []),
    ] }))
    .sort((a, b) => (f.sort === "relevance" ? b.score - a.score : 0) ||
      a.contractor.businessNameNormalized.localeCompare(b.contractor.businessNameNormalized) || a.contractor.id - b.contractor.id);
  return { results, state, interpretation: resolvedIntent ? tradeLocationDescription(resolvedIntent) : undefined };
}
