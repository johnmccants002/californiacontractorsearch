import "server-only";
import { cache } from "react";
import { searchDatabaseContractors as searchContractors } from "@/lib/search/search-contractors";
import { findTradeCityPage, tradeCityPages } from "./directory-pages";

export const DIRECTORY_PAGE_SIZE = 20;

// Request-scoped memoization shares the read between metadata and the page.
// Errors propagate: an outage must not become a successful empty/demo page.
export const getTradeCityDirectory = cache(async (trade: string, city: string) => {
  const page = findTradeCityPage(trade, city);
  if (!page) return null;
  const data = await searchContractors("", 1, DIRECTORY_PAGE_SIZE, {
    classification: page.classification, city: page.cityName, sort: "name",
  });
  if (data.source !== "supabase") return null;
  const contractors = data.results.map((result) => result.contractor).filter((contractor) =>
    contractor.dataSource === "cslb" && contractor.state.toUpperCase() === "CA" &&
    contractor.city.trim().toLowerCase() === page.cityName.toLowerCase() &&
    contractor.classifications.some((classification) => classification.code === page.classification),
  );
  if (!contractors.length) return null;
  return { page, contractors };
});

export async function getAvailableTradeCityPages() {
  const directories = await Promise.all(tradeCityPages.map((page) => getTradeCityDirectory(page.trade, page.city)));
  return directories.flatMap((directory) => directory ? [directory.page] : []);
}
