import "server-only";
import type { PaginatedResults } from "@/lib/contractors/types";
import {
  getAllContractors,
  getContractorsForClassificationFromDatabase,
  searchContractorsFromDatabase,
} from "@/lib/contractors/repository";
import { searchDemoContractors } from "./demo-search";
import type { FilterInput } from "./filters";
import type { SearchClassification } from "./trade-location";
import { typesenseEnabled } from "@/lib/typesense/config";
import { searchTypesenseContractors } from "@/lib/typesense/search";
import { SearchInputError } from "./filters";
import { hasGeoInput } from "./geo";

const DEFAULT_PAGE_SIZE = 10;

export async function searchContractors(
  rawQuery: string, page = 1, pageSize = DEFAULT_PAGE_SIZE, filters: FilterInput = {}, catalog?: SearchClassification[],
): Promise<PaginatedResults> {
  const safePage = Number.isFinite(page) ? Math.min(1_000_000, Math.max(1, Math.floor(page) || 1)) : 1;
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE));
  if (typesenseEnabled()) {
    try { return await searchTypesenseContractors(rawQuery, safePage, safePageSize, filters, catalog); }
    catch (error) {
      if (error instanceof SearchInputError) throw error;
      // Never log raw SDK errors, request headers, search strings, or keys.
      console.warn("Typesense unavailable or out of sync; using database search.");
    }
  }
  return searchDatabaseContractors(rawQuery, safePage, safePageSize, filters, catalog);
}

/** SEO directories intentionally never depend on the optional search index. */
export async function searchDatabaseContractors(
  rawQuery: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  filters: FilterInput = {},
  catalog?: SearchClassification[],
): Promise<PaginatedResults> {
  // The existing database RPC has no county parameter. Fail closed rather than
  // silently dropping a user's county filter during an index outage.
  if (filters.county?.trim()) throw new SearchInputError("County filtering is temporarily unavailable. Remove the county filter or try again later.");
  if (hasGeoInput(filters)) throw new SearchInputError("Location search is temporarily unavailable. Remove the location filter or try again later.");
  const safePage = Number.isFinite(page) ? Math.min(1_000_000, Math.max(1, Math.floor(page) || 1)) : 1;
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE));
  const start = (safePage - 1) * safePageSize;
  const databaseResults = await searchContractorsFromDatabase(rawQuery, start, safePageSize, filters, catalog);

  if (databaseResults) {
    return {
      results: databaseResults.results,
      total: databaseResults.total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(databaseResults.total / safePageSize)),
      source: "supabase",
      interpretation: databaseResults.interpretation,
      state: databaseResults.state,
    };
  }

  const { contractors, source } = await getAllContractors();
  const { results: ranked, interpretation, state } = searchDemoContractors(contractors, rawQuery, filters);

  return {
    results: ranked.slice(start, start + safePageSize),
    total: ranked.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(ranked.length / safePageSize)),
    source,
    interpretation,
    state,
  };
}

export async function getContractorsForClassification(
  classificationSlug: string,
  filters: { q?: string; city?: string; zip?: string; status?: string },
) {
  const databaseContractors = await getContractorsForClassificationFromDatabase(classificationSlug, filters);
  if (databaseContractors) return { source: "supabase" as const, contractors: databaseContractors };

  const { contractors, source } = await getAllContractors();
  const q = filters.q?.trim().toLowerCase();
  const city = filters.city?.trim().toLowerCase();
  const zip = filters.zip?.trim();
  const status = filters.status?.trim().toUpperCase();

  return {
    source,
    contractors: contractors.filter((contractor) => {
      if (!contractor.classifications.some((item) => item.slug === classificationSlug)) return false;
      if (q && !contractor.businessName.toLowerCase().includes(q)) return false;
      if (city && contractor.city.toLowerCase() !== city) return false;
      if (zip && !contractor.zip.startsWith(zip)) return false;
      if (status && contractor.licenseStatus !== status) return false;
      return true;
    }),
  };
}
