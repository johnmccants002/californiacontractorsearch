import { normalizeFilters, searchHref } from "@/lib/search/filters";

export type DirectorySearchParams = Record<string, string | string[] | undefined>;
export interface TradeCityPage {
  trade: string;
  classification: string;
  tradeName: string;
  city: string;
  cityName: string;
  comparisonTip: string;
}

// An editorial allowlist, not a Cartesian product of every trade and city.
export const tradeCityPages: readonly TradeCityPage[] = [
  { trade: "plumbing", classification: "c36", tradeName: "Plumbing", city: "sacramento", cityName: "Sacramento", comparisonTip: "When requesting plumbing estimates, describe the fixtures, piping, or drainage work involved so each contractor can respond to the same scope." },
  { trade: "electrical", classification: "c10", tradeName: "Electrical", city: "los-angeles", cityName: "Los Angeles", comparisonTip: "For electrical work, describe the circuits, equipment, or panel changes you are considering. Ask each contractor what their estimate includes and which details need a site visit." },
  { trade: "roofing", classification: "c39", tradeName: "Roofing", city: "san-diego", cityName: "San Diego", comparisonTip: "For roofing estimates, distinguish a repair from a replacement and describe the roof material if you know it. Ask how inspection findings could change the proposed scope." },
  { trade: "general-building", classification: "b", tradeName: "General Building", city: "san-jose", cityName: "San Jose", comparisonTip: "For a building or remodeling project, share the same plans and scope with each bidder. Ask who will coordinate the different trades and what is excluded from the estimate." },
  { trade: "landscaping", classification: "c27", tradeName: "Landscaping", city: "fresno", cityName: "Fresno", comparisonTip: "For a landscaping project, separate planting, irrigation, and construction requests in your brief. Ask contractors to identify the work and materials included in each estimate." },
];

export function findTradeCityPage(trade: string, city: string) {
  return tradeCityPages.find((page) => page.trade === trade && page.city === city);
}

export function tradeCityPath(page: TradeCityPage) {
  return `/contractors/${page.trade}/${page.city}`;
}

export function tradeCitySearchHref(page: TradeCityPage) {
  return searchHref({ query: "", filters: normalizeFilters({ classification: page.classification, city: page.cityName, sort: "name" }) });
}

// Parameterized directory URLs are for users; only the clean URL is indexable.
// Include empty/repeated/unknown parameters so they cannot create an indexable
// duplicate or bypass the filter policy. robots.txt must allow reading noindex.
export function hasDirectoryQuery(params: DirectorySearchParams) {
  return Object.keys(params).length > 0;
}
