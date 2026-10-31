import type { LicenseStatus } from "@/lib/contractors/types";
import { normalizeClassificationCode, normalizeText } from "./normalize";
import type { TradeLocationQuery } from "./trade-location";
import type { SearchClassification } from "./trade-location";
import { hasGeoInput, type GeoFilter } from "./geo";

export class SearchInputError extends Error {}

export const LICENSE_STATUSES: LicenseStatus[] = ["ACTIVE", "EXPIRED", "SUSPENDED", "INACTIVE"];
export type FilterInput = Partial<Record<"classification" | "city" | "county" | "zip" | "status" | "sort" | "near" | "lat" | "lng" | "radius", string>>;
export interface SearchFilters {
  classification: string;
  city: string;
  county?: string;
  zip: string;
  status: LicenseStatus | "";
  sort: "relevance" | "name" | "distance";
  geo?: GeoFilter;
  near?: string;
}
export interface SearchState {
  query: string;
  filters: SearchFilters;
}

/** Empty GET form controls mean “not selected,” not an override of a new phrase. */
export function readFilterParams(params: Record<string, string | string[] | undefined>): FilterInput {
  const filters: FilterInput = Object.fromEntries(["classification", "city", "county", "zip", "status", "sort", "near", "lat", "lng", "radius"].flatMap((key) => {
    const value = params[key];
    return typeof value === "string" && value.trim() ? [[key, value]] : [];
  }));
  if (params.nearby === "1") {
    filters.sort = "distance";
    filters.radius ||= "25";
  }
  return filters;
}

export function normalizeFilters(input: FilterInput = {}): SearchFilters {
  const status = input.status?.trim().toUpperCase() ?? "";
  const zip = input.zip?.trim() ?? "";
  if (status && !LICENSE_STATUSES.includes(status as LicenseStatus)) throw new SearchInputError("Choose a valid license status.");
  if (zip && !/^\d{5}$/.test(zip)) throw new SearchInputError("Enter a five-digit ZIP code.");
  if (input.sort && !["relevance", "name", "distance"].includes(input.sort)) throw new SearchInputError("Choose a valid sort order.");
  let geo: GeoFilter | undefined;
  if (hasGeoInput(input)) {
    const numeric = (value?: string) => Boolean(value?.trim() && /^-?\d+(?:\.\d+)?$/.test(value.trim()));
    const latitude = Number(input.lat), longitude = Number(input.lng), radius = Number(input.radius);
    if (!numeric(input.lat) || !numeric(input.lng) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new SearchInputError("Enter a valid center latitude and longitude for location search.");
    if (input.radius?.trim() && (!numeric(input.radius) || radius < 0.1 || radius > 250)) throw new SearchInputError("Choose a radius between 0.1 and 250 miles.");
    geo = { latitude, longitude, ...(input.radius?.trim() ? { radiusMiles: radius } : {}) };
  }
  return {
    classification: normalizeClassificationCode(input.classification ?? ""),
    city: normalizeText(input.city ?? ""),
    ...(input.county?.trim() ? { county: normalizeText(input.county) } : {}),
    zip,
    status: status as LicenseStatus | "",
    sort: input.sort === "name" || input.sort === "distance" ? input.sort : "relevance",
    ...(geo ? { geo } : {}),
    ...(input.near?.trim() ? { near: input.near.trim() } : {}),
  };
}

/** Explicit values (including an empty selection) override inferred filters. */
export function resolveSearchState(query: string, input: FilterInput, intent?: TradeLocationQuery | null): SearchState {
  const inferred: FilterInput = intent ? {
    classification: intent.classification.code, city: intent.city ?? "", zip: intent.zip ?? "",
  } : {};
  const explicit = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  return { query: intent ? "" : query.trim(), filters: normalizeFilters({ ...inferred, ...explicit }) };
}

export function validateClassification(input: FilterInput, catalog: SearchClassification[]): FilterInput {
  if (!input.classification?.trim()) return input;
  const code = normalizeClassificationCode(input.classification);
  const text = normalizeText(input.classification);
  const match = catalog.find((c) => c.code === code || [c.name, ...c.aliases].some((alias) => normalizeText(alias) === text));
  if (!match) throw new SearchInputError("Choose a listed trade or classification code, such as C-36.");
  return { ...input, classification: match.code };
}

export function hasSearchFilters(filters: SearchFilters): boolean {
  return Boolean(filters.classification || filters.city || filters.county || filters.zip || filters.status || filters.geo || filters.near);
}

export function searchHref(state: SearchState, page = 1): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const name of ["classification", "city", "county", "zip", "status"] as const) {
    if (state.filters[name]) params.set(name, state.filters[name]);
  }
  // Friendly centers default to distance, so preserve an explicit relevance override.
  if (state.filters.sort !== "relevance" || state.filters.near) params.set("sort", state.filters.sort);
  if (state.filters.near) params.set("near", state.filters.near);
  if (state.filters.geo) {
    if (!state.filters.near) {
      params.set("lat", String(state.filters.geo.latitude)); params.set("lng", String(state.filters.geo.longitude));
    }
    if (state.filters.geo.radiusMiles !== undefined) params.set("radius", String(state.filters.geo.radiusMiles));
  }
  if (page > 1) params.set("page", String(page));
  return `/search${params.size ? `?${params}` : ""}`;
}

export function removeFilterHref(state: SearchState, name: keyof SearchFilters): string {
  if (name === "geo" || name === "near") return searchHref({ ...state, filters: { ...state.filters, geo: undefined, near: undefined, sort: state.filters.sort === "distance" ? "relevance" : state.filters.sort } });
  return searchHref({ ...state, filters: { ...state.filters, [name]: name === "sort" ? "relevance" : "" } });
}

export function clearFiltersHref(state: SearchState): string {
  return searchHref({ query: state.query, filters: normalizeFilters() });
}
