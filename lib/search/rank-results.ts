import type { Contractor, SearchResult } from "@/lib/contractors/types";
import { normalizeBusinessName, normalizeText } from "./normalize";
import type { ParsedQuery } from "./parse-query";

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const result = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

export function trigramSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = trigrams(left);
  const b = trigrams(right);
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function singularize(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ers") && token.length > 5) return token.slice(0, -1);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

export function rankContractor(contractor: Contractor, query: ParsedQuery): SearchResult {
  const matchedBy: string[] = [];
  let score = 0;
  const business = contractor.businessNameNormalized;
  const businessQuery = normalizeBusinessName(query.original);
  const city = normalizeText(contractor.city);
  const people = contractor.personnel.map((person) => person.fullNameNormalized);
  const classificationCodes = contractor.classifications.map((item) => item.code.toLowerCase());
  const classificationText = contractor.classifications
    .flatMap((item) => [item.name, ...item.aliases])
    .map(normalizeText)
    .join(" ");

  if (query.kind === "license" && contractor.licenseNumber === query.compact) {
    score += 1000;
    matchedBy.push("exact license number");
  }
  if (businessQuery && business === businessQuery) {
    score += 800;
    matchedBy.push("exact business name");
  } else if (businessQuery && business.startsWith(businessQuery)) {
    score += 650;
    matchedBy.push("business name prefix");
  }
  if (people.some((person) => person === query.normalized)) {
    score += 600;
    matchedBy.push("exact personnel name");
  }
  if (query.kind === "classification" && classificationCodes.includes(query.compact)) {
    score += 550;
    matchedBy.push("exact classification");
  }
  if (query.kind === "zip" && contractor.zip.startsWith(query.compact)) {
    score += 500;
    matchedBy.push("ZIP code");
  }
  if (query.normalized === city) {
    score += 450;
    matchedBy.push("city");
  }

  const businessFuzzy = trigramSimilarity(business, businessQuery);
  if (businessFuzzy >= 0.32 && !matchedBy.some((match) => match.includes("business"))) {
    score += Math.round(businessFuzzy * 400);
    matchedBy.push("similar business name");
  }
  const bestPersonFuzzy = Math.max(0, ...people.map((person) => trigramSimilarity(person, query.normalized)));
  if (bestPersonFuzzy >= 0.45 && !matchedBy.includes("exact personnel name")) {
    score += Math.round(bestPersonFuzzy * 300);
    matchedBy.push("similar personnel name");
  }

  const searchable = normalizeText(
    [
      contractor.businessName,
      contractor.city,
      contractor.zip,
      classificationCodes.join(" "),
      classificationText,
      people.join(" "),
    ].join(" "),
  );
  let matchedTokens = 0;
  for (const token of query.tokens) {
    const stem = singularize(token);
    if (searchable.includes(token) || searchable.includes(stem)) matchedTokens += 1;
  }
  if (query.tokens.length > 0) {
    const coverage = matchedTokens / query.tokens.length;
    if (coverage === 1) {
      score += 240 + matchedTokens * 15;
      matchedBy.push("all search terms");
    } else if (coverage >= 0.5) {
      score += Math.round(coverage * 120);
      matchedBy.push("some search terms");
    }
  }

  if (classificationText.includes(query.normalized) && query.normalized) {
    score += 220;
    matchedBy.push("trade name");
  }
  if (contractor.licenseStatus === "ACTIVE" && score > 0) score += 10;

  return { contractor, score, matchedBy: [...new Set(matchedBy)] };
}

export function rankResults(contractors: Contractor[], query: ParsedQuery): SearchResult[] {
  return contractors
    .map((contractor) => rankContractor(contractor, query))
    .filter((result) => result.score >= 90)
    .sort((left, right) => right.score - left.score || left.contractor.businessName.localeCompare(right.contractor.businessName));
}
