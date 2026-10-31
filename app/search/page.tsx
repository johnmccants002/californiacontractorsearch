import type { Metadata } from "next";
import Link from "next/link";
import { SearchControls } from "@/components/search/search-controls";
import { ResultCard } from "@/components/search/result-card";
import { Pagination } from "@/components/pagination";
import { searchContractors } from "@/lib/search/search-contractors";
import { getSearchClassifications } from "@/lib/contractors/repository";
import { clearFiltersHref, hasSearchFilters, LICENSE_STATUSES, normalizeFilters, readFilterParams, searchHref, SearchInputError, type SearchState } from "@/lib/search/filters";
import type { PaginatedResults, LicenseStatus } from "@/lib/contractors/types";
import { resolveLocationInput } from "@/lib/search/location-reference";
import { DataFreshness } from "@/components/data-freshness";
import { getDataFreshness } from "@/lib/refresh/freshness";

export const metadata: Metadata = {
  title: "Search California Contractor Licenses",
  description: "Search California contractor license records by name, license number, trade, city, ZIP, or classification.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (name: string) => typeof params[name] === "string" ? params[name] as string : undefined;
  const query = one("q")?.trim() ?? "";
  const page = Number(one("page") ?? "1");
  const filters = readFilterParams(params);
  const catalog = await getSearchClassifications();
  let data: PaginatedResults | undefined;
  let error: string | undefined;
  let state: SearchState = { query, filters: { ...normalizeFilters(), ...filters,
    status: LICENSE_STATUSES.includes(filters.status as LicenseStatus) ? filters.status as LicenseStatus : "",
    sort: filters.sort === "name" || filters.sort === "distance" ? filters.sort : "relevance",
  } };
  try {
    // Keep removable chips for valid filters even when the backend is unavailable.
    // Invalid raw values remain visible in the form so users can correct them.
    const resolved = resolveLocationInput(filters);
    state.filters = normalizeFilters(resolved);
    data = await searchContractors(query, page, 10, resolved, catalog);
    state = data.state;
  } catch (cause) {
    if (!(cause instanceof SearchInputError)) throw cause;
    error = cause.message;
  }
  const hasSearch = Boolean(state.query || hasSearchFilters(state.filters));
  const freshness = data?.source === "supabase" ? await getDataFreshness() : undefined;

  return <div className="page-shell inner-page">
    <header className="search-page-heading"><div><p className="eyebrow"><span>01</span> / THE SEARCH INDEX</p><h1>Find a contractor.</h1></div>
      <p>Search public license records. Refine by trade, registered location, or license status.</p>
    </header>
    <SearchControls key={`${searchHref(state)}:${error ?? ""}`} state={state} catalog={catalog} error={error} geoInput={filters} />
    {freshness ? <DataFreshness data={freshness} /> : null}

    {!hasSearch && !error ? <section className="empty-state">
      <p className="eyebrow">YOUR SEARCH STARTS HERE</p><h2>A name. A number. A place.</h2>
      <p>Enter a license number, business or personnel name, trade, classification, city, or ZIP code. Or use the filters above to explore a trade.</p>
    </section> : data ? <>
      <header className="results-heading"><div>
        <p className="eyebrow">{data.total.toLocaleString("en-US")} {data.total === 1 ? "RESULT" : "RESULTS"} / LICENSE RECORDS</p>
        <h2 className="mt-2">{state.query ? `Search results for “${state.query}”` : "Contractors matching your filters"}</h2>
        {data.interpretation ? <p>Your search was converted into the editable filters above.</p> : null}
        {data.source === "demo" ? <p className="record-warning">Showing fictional demonstration records. Connect Supabase and load current public data before production use.</p> : null}
      </div><p>{data.source === "demo" ? "Fictional demonstration records." : "Not a live CSLB status check."}<br />Verify current details with CSLB.</p></header>

      {data.results.length ? <>
        <div className="results-list">{data.results.map((result) => <ResultCard key={result.contractor.id} contractor={result.contractor} matchedBy={result.matchedBy} highlightTokens={result.highlightTokens} distanceMiles={result.distanceMiles} />)}</div>
        <Pagination page={data.page} totalPages={data.totalPages} state={state} />
      </> : <section className="empty-state">
        <p className="eyebrow">NO RECORDS TO DISPLAY</p>
        <h2>{data.total ? "This page is beyond the last result." : "No contractors matched your search."}</h2>
        <p>{data.total ? "Return to the first page with your filters intact." : "Try fewer words, check the spelling, or remove a filter to broaden your search."}</p>
        <div className="flex flex-wrap gap-3"><Link href={data.total ? searchHref(state) : clearFiltersHref(state)} className="button-secondary">{data.total ? "Back to first page" : "Clear filters"}</Link>
          {!data.total ? <Link href="/search" className="button-secondary">Start a new search</Link> : null}
        </div>
      </section>}
    </> : null}
  </div>;
}
