import type { LicenseStatus } from "@/lib/contractors/types";
import { normalizeClassificationCode, normalizeText } from "./normalize";
import type { TradeLocationQuery } from "./trade-location";
import type { SearchClassification } from "./trade-location";

export class SearchInputError extends Error {}

export const LICENSE_STATUSES: LicenseStatus[] = ["ACTIVE", "EXPIRED", "SUSPENDED", "INACTIVE"];
export type FilterInput = Partial<Record<"classification" | "city" | "zip" | "status" | "sort", string>>;
export interface SearchFilters {
  classification: string;
  city: string;
  zip: string;
  status: LicenseStatus | "";
  sort: "relevance" | "name";
}
export interface SearchState {
  query: string;
  filters: SearchFilters;
}

/** Empty GET form controls mean “not selected,” not an override of a new phrase. */
export function readFilterParams(params: Record<string, string | string[] | undefined>): FilterInput {
  return Object.fromEntries(["classification", "city", "zip", "status", "sort"].flatMap((key) => {
    const value = params[key];
    return typeof value === "string" && value.trim() ? [[key, value]] : [];
  }));
}

export function normalizeFilters(input: FilterInput = {}): SearchFilters {
  const status = input.status?.trim().toUpperCase() ?? "";
  const zip = input.zip?.trim() ?? "";
  if (status && !LICENSE_STATUSES.includes(status as LicenseStatus)) throw new SearchInputError("Choose a valid license status.");
  if (zip && !/^\d{5}$/.test(zip)) throw new SearchInputError("Enter a five-digit ZIP code.");
  if (input.sort && !["relevance", "name"].includes(input.sort)) throw new SearchInputError("Choose a valid sort order.");
  return {
    classification: normalizeClassificationCode(input.classification ?? ""),
    city: normalizeText(input.city ?? ""),
    zip,
    status: status as LicenseStatus | "",
    sort: input.sort === "name" ? "name" : "relevance",
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
  return Boolean(filters.classification || filters.city || filters.zip || filters.status);
}

export function searchHref(state: SearchState, page = 1): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const name of ["classification", "city", "zip", "status"] as const) {
    if (state.filters[name]) params.set(name, state.filters[name]);
  }
  if (state.filters.sort !== "relevance") params.set("sort", state.filters.sort);
  if (page > 1) params.set("page", String(page));
  return `/search${params.size ? `?${params}` : ""}`;
}

export function removeFilterHref(state: SearchState, name: keyof SearchFilters): string {
  return searchHref({ ...state, filters: { ...state.filters, [name]: name === "sort" ? "relevance" : "" } });
}

export function clearFiltersHref(state: SearchState): string {
  return searchHref({ query: state.query, filters: normalizeFilters() });
}
