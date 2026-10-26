import type { Contractor } from "@/lib/contractors/types";
import { normalizeBusinessName, normalizeText } from "./normalize";
import { parseQuery } from "./parse-query";
import { rankResults } from "./rank-results";
import { parseTradeLocation, tradeLocationDescription, tradeLocationLabels } from "./trade-location";

export function searchDemoContractors(contractors: Contractor[], rawQuery: string) {
  const catalog = [...new Map(contractors.flatMap((c) => c.classifications).map((c) => [c.code, c])).values()];
  const intent = parseTradeLocation(rawQuery, catalog);
  const exactBusiness = contractors.some((c) => c.businessNameNormalized === normalizeBusinessName(rawQuery));
  const knownLocation = intent && (intent.explicitLocation || !intent.city ||
    contractors.some((c) => normalizeText(c.city) === intent.city));

  if (intent && knownLocation && !exactBusiness) {
    const results = contractors.filter((c) =>
      c.classifications.some((classification) => classification.code === intent.classification.code) &&
      (!intent.city || normalizeText(c.city) === intent.city) &&
      (!intent.zip || c.zip.startsWith(intent.zip)))
      .sort((a, b) => a.licenseStatus.localeCompare(b.licenseStatus) ||
        a.businessNameNormalized.localeCompare(b.businessNameNormalized) || a.id - b.id)
      .map((contractor) => ({
        contractor,
        score: contractor.licenseStatus === "ACTIVE" ? 1010 : 1000,
        matchedBy: tradeLocationLabels(intent),
      }));
    return { results, interpretation: tradeLocationDescription(intent) };
  }

  const parsed = parseQuery(rawQuery);
  return { results: parsed.kind === "empty" ? [] : rankResults(contractors, parsed), interpretation: undefined };
}
