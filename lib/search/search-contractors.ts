import "server-only";
import type { PaginatedResults } from "@/lib/contractors/types";
import { getAllContractors } from "@/lib/contractors/repository";
import { parseQuery } from "./parse-query";
import { rankResults } from "./rank-results";

const DEFAULT_PAGE_SIZE = 10;

export async function searchContractors(
  rawQuery: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<PaginatedResults> {
  const parsed = parseQuery(rawQuery);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE));
  const { contractors, source } = await getAllContractors();
  const ranked = parsed.kind === "empty" ? [] : rankResults(contractors, parsed);
  const start = (safePage - 1) * safePageSize;

  return {
    results: ranked.slice(start, start + safePageSize),
    total: ranked.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(ranked.length / safePageSize)),
    source,
  };
}

export async function getContractorsForClassification(
  classificationSlug: string,
  filters: { q?: string; city?: string; zip?: string; status?: string },
) {
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
