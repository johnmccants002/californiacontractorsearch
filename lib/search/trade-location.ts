import type { Classification } from "@/lib/contractors/types";
import { displayClassificationCode, normalizeText } from "./normalize";

export type SearchClassification = Pick<Classification, "id" | "code" | "name" | "aliases">;

export interface TradeLocationQuery {
  classification: SearchClassification;
  city?: string;
  zip?: string;
  explicitLocation: boolean;
}

/** A candidate, not a final interpretation: callers must protect business names
 * and verify implicit cities against their data before applying these filters. */
export function parseTradeLocation(
  input: string,
  classifications: SearchClassification[],
): TradeLocationQuery | null {
  const normalized = normalizeText(input).replace(/\b([a-z])\s+(\d{1,2})\b/g, "$1$2");
  const phrases = classifications.flatMap((classification) => {
    const aliases = [classification.code, classification.name, ...classification.aliases];
    return aliases.flatMap((alias) => {
      const phrase = normalizeText(alias);
      const variants = phrase.endsWith(" contractor") ? [phrase, `${phrase}s`] : [phrase];
      return variants.map((text) => ({ text, classification }));
    });
  }).sort((a, b) => b.text.length - a.text.length);

  for (const { text, classification } of phrases) {
    if (!text || !normalized.startsWith(`${text} `)) continue;
    let location = normalized.slice(text.length + 1);
    const explicitLocation = location.startsWith("in ");
    if (explicitLocation) location = location.slice(3);
    // A state suffix is optional; "near" is intentionally not treated as a
    // city filter because we do not yet have service areas or radius search.
    location = location.replace(/\s+(?:ca|california)$/, "");
    const zip = location.match(/(?:^|\s)(\d{5})$/)?.[1];
    if (zip) location = location.slice(0, -5).trim();
    const city = location.replace(/\s+(?:ca|california)$/, "").trim() || undefined;
    if (!city && !zip) continue;
    if (city && (!/[a-z]/.test(city) || /^(?:in|near)\b/.test(city))) continue;
    return { classification, city, zip, explicitLocation };
  }
  return null;
}

export function tradeLocationLabels(query: TradeLocationQuery): string[] {
  return [
    `${displayClassificationCode(query.classification.code)} classification`,
    ...(query.city ? [`city: ${query.city}`] : []),
    ...(query.zip ? [`ZIP: ${query.zip}`] : []),
  ];
}

export function tradeLocationDescription(query: TradeLocationQuery): string {
  const location = [query.city, query.zip].filter(Boolean).join(" ");
  return `Filtering by ${displayClassificationCode(query.classification.code)} and registered business location: ${location}. This is not a service-area search.`;
}
